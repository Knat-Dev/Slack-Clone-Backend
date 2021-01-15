/* eslint-disable no-async-promise-executor */
import { DocumentType, mongoose } from "@typegoose/typegoose";
import { createWriteStream } from "fs";
import { GraphQLUpload } from "graphql-upload";
import {
	Arg,
	Ctx,
	FieldResolver,
	Mutation,
	PubSub,
	PubSubEngine,
	Query,
	Resolver,
	Root,
	Subscription,
	UseMiddleware,
} from "type-graphql";
import { Upload } from "../..";
import {
	ChannelModel,
	DirectMessage,
	DirectMessageModel,
	MessageModel,
	TeamModel,
	User,
	UserModel,
} from "../../../models";
import { DirectMessageSubscription, isAuthorized } from "../../../util";
import { Context } from "../../context";

// Subscription Topics
const NEW_DIRECT_MESSAGE = "NEW_DIRECT_MESSAGE";

@Resolver(() => DirectMessage)
export class DirectMessageResolver {
	@Mutation(() => Boolean)
	@UseMiddleware(isAuthorized)
	async createDirectMessage(
		@Arg("receiverId") receiverId: string,
		@Arg("teamId") teamId: string,
		@Arg("text") text: string,
		@Ctx() { payload }: Context,
		@PubSub() pubsub: PubSubEngine
	): Promise<boolean> {
		if (!payload?.userId) return false;

		// check not member and that the channel actually exists in one go
		const team = await TeamModel.findOne({
			$and: [
				{
					$or: [
						{
							memberIds: {
								$elemMatch: { $eq: payload.userId },
							},
						},
						{
							ownerId: mongoose.Types.ObjectId(payload.userId),
						},
					],
				},
				{
					_id: teamId,
				},
			],
		});

		const user = await UserModel.findById(mongoose.Types.ObjectId(receiverId));

		if (!team || !user || !text.trim()) return false;

		try {
			const message = await DirectMessageModel.create({
				teamId: team.id,
				receiverId,
				text: text.trim(),
				senderId: payload.userId,
			});
			await pubsub.publish(NEW_DIRECT_MESSAGE, message);
			return true;
		} catch (e) {
			console.log(e);
			return false;
		}
	}

	@Query(() => [DirectMessage])
	@UseMiddleware(isAuthorized)
	async directMessages(
		@Arg("receiverId") receiverId: string,
		@Arg("teamId") teamId: string,
		@Ctx() { payload }: Context
	): Promise<DirectMessage[]> {
		if (!payload?.userId) return [] as DirectMessage[];
		// console.log(receiverId, teamId, payload.userId);
		const directMessages = await DirectMessageModel.find({
			teamId,
			$or: [
				{
					$and: [
						{
							senderId: (receiverId as unknown) as mongoose.Types.ObjectId,
						},
						{
							receiverId: (payload.userId as unknown) as mongoose.Types.ObjectId,
						},
					],
				},
				{
					$and: [
						{
							senderId: (payload.userId as unknown) as mongoose.Types.ObjectId,
						},
						{
							receiverId: (receiverId as unknown) as mongoose.Types.ObjectId,
						},
					],
				},
			],
		});

		return directMessages;
	}

	@Mutation(() => Boolean)
	@UseMiddleware(isAuthorized)
	async uploadFileDirect(
		@Arg("receiverId") receiverId: string,
		@Arg("file", () => GraphQLUpload)
		file: Upload,
		@Arg("teamId") teamId: string,
		@Ctx() { payload }: Context,
		@PubSub() pubsub: PubSubEngine
	): Promise<boolean> {
		const { createReadStream, filename, mimetype } = await file;
		const filesFolder = __dirname + "../../../../../build/files";

		if (!payload?.userId || !receiverId) return false;

		return await new Promise(
			async (resolve, reject) =>
				await createReadStream()
					.pipe(createWriteStream(`${filesFolder}/${filename}`))
					.on("finish", async () => {
						const session = await mongoose.startSession();
						session.startTransaction();
						// check not member and that the channel actually exists in one go
						const receiver = await UserModel.findById(
							mongoose.Types.ObjectId(receiverId)
						).session(session);

						await session.commitTransaction();
						session.endSession();
						const receiverInTeam = receiver?.teamIds?.find(
							(team_id) => team_id === mongoose.Types.ObjectId(teamId)
						);
						console.log(receiverInTeam);
						if (!receiver || !receiver || !receiverInTeam || !file) reject(false);
						const message = await DirectMessageModel.create([
							{
								receiverId,
								senderId: payload?.userId,
								teamId,
								url: `${process.env.HOST_NAME}/files/${filename}`,
								filetype: mimetype,
							},
						]);
						console.log(message[0]);
						await pubsub.publish(NEW_DIRECT_MESSAGE, message[0]);
						resolve(true);
					})
					.on("close", () => resolve(true))
					.on("error", (e) => {
						console.error(e);
						reject(false);
					})
		);
	}

	@FieldResolver(() => User, { nullable: true })
	async sender(
		@Root() { senderId }: DocumentType<DirectMessage>
	): Promise<User | null> {
		return await UserModel.findById(senderId);
	}

	@Subscription(() => DirectMessage, {
		nullable: true,
		topics: NEW_DIRECT_MESSAGE,
		filter: async ({ payload, args, context }): Promise<boolean> => {
			const userId = context.userId;
			const team = await TeamModel.findOne({ _id: args.teamId });
			return (
				!!team &&
				payload.teamId === args.teamId &&
				((args.receiverId === payload.receiverId && userId === payload.senderId) ||
					(userId === payload.receiverId && args.receiverId === payload.senderId))
			);
		},
	})
	newDirectMessage(
		@Root() message: DocumentType<DirectMessage>,
		@Arg("receiverId") receiverId: string,
		@Arg("teamId") teamId: string,
		@Ctx() context: Context
	): DirectMessage {
		return message;
	}
}
