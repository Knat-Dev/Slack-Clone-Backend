/* eslint-disable no-async-promise-executor */
import { DocumentType, mongoose } from "@typegoose/typegoose";
import { createWriteStream } from "fs";
import { GraphQLUpload } from "graphql-upload";
import {
	Arg,
	Ctx,
	Field,
	FieldResolver,
	Mutation,
	ObjectType,
	Publisher,
	PubSub,
	PubSubEngine,
	Query,
	Resolver,
	Root,
	Subscription,
	UseMiddleware,
} from "type-graphql";
import {
	ChannelModel,
	Message,
	MessageModel,
	TeamModel,
	User,
	UserModel,
} from "../../../models";
import { isAuthorized } from "../../../util";
import { Context } from "../../context";
import { Upload } from "../types";

// Subscription Topics
const NEW_CHANNEL_MESSAGE = "NEW_CHANNEL_MESSAGE";

@ObjectType()
class PaginatedMessages {
	@Field()
	hasMore: boolean;

	@Field(() => [Message])
	page: DocumentType<Message>[];
}

@Resolver(() => Message)
export class MessageResolver {
	@Mutation(() => Message, { nullable: true })
	@UseMiddleware(isAuthorized)
	async createMessage(
		@Arg("channelId") channelId: string,
		@Arg("text") text: string,
		@Arg("teamId") teamId: string,
		@Ctx() { payload }: Context,
		@PubSub("NEW_CHANNEL_MESSAGE") pubsub: Publisher<DocumentType<Message>>
	): Promise<DocumentType<Message> | null> {
		if (!payload?.userId) return null;
		const session = await mongoose.startSession();
		session.startTransaction();
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
		}).session(session);
		const channel = await ChannelModel.findOne({
			_id: mongoose.Types.ObjectId(channelId),
			$or: [
				{ public: true },
				{
					public: false,
					userIds: {
						$elemMatch: { $eq: [payload.userId] },
					},
				},
			],
		}).session(session);
		await session.commitTransaction();
		session.endSession();
		if (!team || !channel || !text.trim()) return null;

		try {
			const message = await MessageModel.create({
				text: text.trim(),
				channelId,
				userId: payload.userId,
			});
			await pubsub(message);
			return message;
		} catch (e) {
			console.log(e);
			return null;
		}
	}

	@Mutation(() => Boolean)
	@UseMiddleware(isAuthorized)
	async uploadFile(
		@Arg("channelId") channelId: string,
		@Arg("file", () => GraphQLUpload)
		file: Upload,
		@Arg("teamId") teamId: string,
		@Ctx() { payload }: Context,
		@PubSub() pubsub: PubSubEngine
	): Promise<boolean> {
		const { createReadStream, filename, mimetype } = await file;
		console.log(file);
		const filesFolder = __dirname + "../../../../../build/files";

		if (!payload?.userId) return false;

		return await new Promise(
			async (resolve, reject) =>
				await createReadStream()
					.pipe(createWriteStream(`${filesFolder}/${filename}`))
					.on("finish", async () => {
						const session = await mongoose.startSession();
						session.startTransaction();
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
						}).session(session);
						const channel = await ChannelModel.findOne({
							_id: mongoose.Types.ObjectId(channelId),
							$or: [
								{ public: true },
								{
									public: false,
									userIds: {
										$elemMatch: { $eq: [payload.userId] },
									},
								},
							],
						}).session(session);

						await session.commitTransaction();
						session.endSession();
						if (!team || !channel || !file) {
							return resolve(false);
						}
						console.log(channel);
						const message = await MessageModel.create({
							channelId,
							userId: payload?.userId,
							url: `${process.env.HOST_NAME}/files/${filename}`,
							filetype: mimetype,
						});
						await pubsub.publish(NEW_CHANNEL_MESSAGE, message);
						resolve(true);
					})
					.on("error", (e) => {
						console.error(e);
						return reject(false);
					})
		);
	}

	@Query(() => PaginatedMessages)
	@UseMiddleware(isAuthorized)
	async messages(
		@Arg("channelId") channelId: string,
		@Arg("cursor", () => String, { nullable: true }) cursor: string,
		@Ctx() { payload }: Context,
		@PubSub("NEW_CHANNEL_MESSAGE") pubsub: Publisher<DocumentType<Message>>
	): Promise<PaginatedMessages> {
		const LIMIT = 100 + 1;
		if (!payload?.userId) return { hasMore: false, page: [] };
		const channelFound = await ChannelModel.findOne({
			_id: mongoose.Types.ObjectId(channelId),
			$or: [
				{ public: true },
				{
					public: false,
					userIds: {
						$elemMatch: { $eq: [payload.userId] },
					},
				},
			],
		});
		if (channelFound) {
			const options: any = {};

			if (cursor)
				options.createdAt = {
					$lt: new Date(parseFloat(cursor)),
				};
			const messages = (
				await MessageModel.find({ channelId, ...options })
					.sort({ createdAt: -1 })
					.limit(LIMIT)
			) // +1 for hasMore check
				.reverse();
			const hasMore = messages.length === LIMIT;
			if (hasMore) messages.splice(0, 1);
			return { page: messages, hasMore };
		} else return { hasMore: false, page: [] };
	}

	@Query(() => [Message])
	@UseMiddleware(isAuthorized)
	async newMessages(
		@Arg("channelId") channelId: string,
		@Arg("cursor", () => String, { nullable: true }) cursor: string | null
	): Promise<DocumentType<Message>[]> {
		if (!cursor)
			return await MessageModel.find({
				channelId,
			});
		return await await MessageModel.find({
			channelId,
			createdAt: { $gt: new Date(parseFloat(cursor)) },
		});
	}

	@FieldResolver(() => User, { nullable: true })
	async user(@Root() { userId }: DocumentType<Message>): Promise<User | null> {
		return await UserModel.findById(userId);
	}

	@Mutation(() => Boolean)
	@UseMiddleware(isAuthorized)
	async deleteMessage(
		@Arg("messageId") messageId: string,
		@Ctx() { payload }: Context,
		@PubSub(NEW_CHANNEL_MESSAGE) pubsub: Publisher<DocumentType<Message>>
	): Promise<boolean> {
		if (!payload?.userId) return false;
		const message = await MessageModel.findById(messageId);
		if (message?.userId !== (payload.userId as any) || !message) return false;
		try {
			await message.remove();
		} catch (e) {
			console.log(e);
			return false;
		}
		pubsub(message);
		return true;
	}

	@Subscription(() => Message, {
		nullable: true,
		topics: NEW_CHANNEL_MESSAGE,
		filter: async ({ payload, args }) => {
			const channel = await ChannelModel.findOne({ _id: args.channelId });
			const team = await TeamModel.findOne({ _id: channel?.teamId });
			return !!team && payload.channelId === args.channelId;
		},
	})
	newChannelMessage(
		@Root() message: DocumentType<Message>,
		@Arg("channelId") channelId: string
	): Message {
		return { ...message, id: message._id };
	}
}
