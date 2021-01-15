import { DocumentType, mongoose } from "@typegoose/typegoose";
import { mongo, Types } from "mongoose";
import {
	Arg,
	Ctx,
	Field,
	FieldResolver,
	InputType,
	Mutation,
	ObjectType,
	Resolver,
	Root,
	UseMiddleware,
} from "type-graphql";
import {
	Channel,
	ChannelModel,
	TeamModel,
	User,
	UserModel,
} from "../../../models";
import { isAuthorized } from "../../../util";
import { Context } from "../../context";
import { FieldError } from "../types";

@ObjectType()
class ChannelResponse {
	@Field(() => Channel, { nullable: true })
	channel?: Channel | null;

	@Field()
	ok: boolean;

	@Field(() => [FieldError], { nullable: true })
	errors?: FieldError[] | null;
}

@InputType()
class MemberMultiselect {
	@Field(() => String)
	value: mongoose.Types.ObjectId;

	@Field(() => String)
	label: string;
}

@Resolver(() => Channel)
export class ChannelResolver {
	@Mutation(() => ChannelResponse)
	@UseMiddleware(isAuthorized)
	async createChannel(
		@Arg("teamId") teamId: string,
		@Arg("name") name: string,
		@Arg("users", () => [MemberMultiselect])
		users: MemberMultiselect[],
		@Arg("public", { defaultValue: false }) publicChannel: boolean,
		@Arg("dm", { defaultValue: false })
		dm: boolean,
		@Ctx()
		{ payload }: Context
	): Promise<ChannelResponse> {
		const errors: FieldError[] = [];

		if (!name) errors.push({ field: "name", message: "Must not be empty" });
		else if (name.length < 2)
			errors.push({
				field: "name",
				message: "Name length must be at least 2 characters long",
			});
		const teamOwner = await TeamModel.findOne({
			ownerId: mongoose.Types.ObjectId(payload?.userId),
			_id: mongoose.Types.ObjectId(teamId),
		});
		if (!teamOwner && !dm)
			errors.push({
				field: "teamId",
				message: "You must be team owner to do that!",
			});

		const userIds = users.map((user) => user.value);
		if (!publicChannel && !userIds.includes(payload?.userId as any))
			userIds.push(payload?.userId as any);
		if (errors.length > 0) return { ok: false, errors };

		try {
			if (dm && !publicChannel) {
				const channel = await ChannelModel.findOne({
					teamId,
					dm: true,
					public: false,
					userIds: { $size: userIds.length, $all: userIds.map((id) => [id]) },
				});
				if (channel) return { ok: true, channel };
				else {
					const users = await UserModel.find({ _id: { $in: userIds } });
					console.log(users);
					const name = users.map((u) => u.username).join(", ");
					console.log(name);
					const channel = await ChannelModel.create({
						name,
						teamId,
						public: publicChannel,
						userIds,
						dm,
					});
					return { channel, ok: true, errors: null };
				}
			}

			const channel = await ChannelModel.create({
				name,
				teamId,
				public: publicChannel,
				userIds,
				dm,
			});

			return { channel, ok: true, errors: null };
		} catch (e) {
			if (e.code === 11000 && e.keyValue["name"] && e.keyValue["teamId"]) {
				return {
					ok: false,
					errors: [
						{
							field: "name",
							message: `This team already has a channel with a name of "${e.keyValue["name"]}"`,
						},
					],
				};
			}
			return {
				ok: false,
				errors: [
					{
						field: "general",
						message:
							"We could not create your channel at this time, please try again later!",
					},
				],
			};
		}
	}

	@FieldResolver()
	async users(@Root() { userIds }: DocumentType<Channel>): Promise<User[]> {
		return await UserModel.find({ _id: { $in: userIds } });
	}
}
