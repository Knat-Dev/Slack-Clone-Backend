import { DocumentType, mongoose } from "@typegoose/typegoose";
import { Types } from "mongoose";
import {
	Arg,
	Ctx,
	Field,
	FieldResolver,
	Mutation,
	ObjectType,
	Query,
	Resolver,
	Root,
	UseMiddleware,
} from "type-graphql";
import validator from "validator";
import {
	Channel,
	ChannelModel,
	Team,
	TeamModel,
	User,
	UserModel,
} from "../../../models";
import { isAuthorized } from "../../../util";
import { Context } from "../../context";
import { FieldError } from "../types";

@ObjectType()
class InvitePeopleResponse {
	@Field()
	ok: boolean;

	@Field(() => [FieldError], { nullable: true })
	errors?: FieldError[] | undefined | null;

	@Field(() => User, { nullable: true })
	member?: User | null;
}

@ObjectType()
class CreateTeamResponse {
	@Field(() => Team, { nullable: true })
	team?: Team | null;

	@Field()
	ok: boolean;

	@Field(() => [FieldError], { nullable: true })
	errors?: FieldError[];
}

@Resolver(() => Team)
export class TeamResolver {
	@Mutation(() => CreateTeamResponse, { nullable: true })
	@UseMiddleware(isAuthorized)
	async createTeam(
		@Arg("name") name: string,
		@Ctx() { payload }: Context
	): Promise<CreateTeamResponse> {
		if (payload?.userId) {
			const errors: FieldError[] = [];
			if (!name) errors.push({ field: "name", message: "Must not be empty" });
			else if (name.length < 2)
				errors.push({
					field: "name",
					message: "Name length must be greater than 2 characters",
				});

			if (errors.length > 0) return { ok: false, errors };
			const session = await mongoose.startSession();
			session.startTransaction();

			try {
				const team = await TeamModel.create(
					[
						{
							name,
							ownerId: Types.ObjectId(payload.userId),
						},
					],
					{ session }
				);
				await ChannelModel.create(
					[
						{
							name: "general",
							teamId: team[0].id,
							public: true,
						},
					],
					{ session }
				);
				await UserModel.findOneAndUpdate(
					{ _id: payload.userId },
					{ $push: { teamIds: team[0].id } }
				);
				await session.commitTransaction();
				session.endSession();

				return { team: team[0], ok: true, errors: undefined };
			} catch (e) {
				console.log(e);
				await session.abortTransaction();
				session.endSession();
				if (e.code === 11000 && e.keyValue["name"] && e.keyValue["ownerId"]) {
					errors.push({
						field: "name",
						message: `You are already the owner of '${e.keyValue["name"]}'`,
					});
					return {
						ok: false,
						errors,
					};
				} else
					return {
						ok: false,
						errors: [
							{
								field: "general",
								message: "We are having issues creating the team, please try again!",
							},
						],
					};
			}
		}
		return {
			ok: false,
			errors: [{ field: "auth", message: "Not authenticated" }],
		};
	}

	@Query(() => Team, { nullable: true })
	async team(@Arg("id") id: string): Promise<Team | null> {
		return await TeamModel.findById(id);
	}

	@FieldResolver(() => [Channel])
	async channels(
		@Root() { id: teamId }: DocumentType<Team>,
		@Ctx() { payload }: Context
	): Promise<Channel[]> {
		if (!payload?.userId) return [];
		return await ChannelModel.find({
			teamId,
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
	}

	@FieldResolver(() => [Channel])
	async owner(@Root() { ownerId }: DocumentType<Team>): Promise<User | null> {
		return UserModel.findById(ownerId);
	}

	@FieldResolver(() => [User])
	async members(
		@Root() { id }: DocumentType<Team>,
		@Ctx() { payload }: Context
	): Promise<User[]> {
		return await UserModel.find({
			teamIds: { $elemMatch: { $eq: id } },
		});
	}

	@FieldResolver(() => Boolean)
	admin(@Root() team: DocumentType<Team>, @Ctx() { payload }: Context): boolean {
		if (team.ownerId && payload?.userId)
			return (team.ownerId as Types.ObjectId).equals(payload?.userId);
		return false;
	}

	@Mutation(() => InvitePeopleResponse)
	@UseMiddleware(isAuthorized)
	async addTeamMember(
		@Ctx() { payload }: Context,
		@Arg("email") email: string,
		@Arg("teamId") teamId: string
	): Promise<InvitePeopleResponse> {
		const errors: FieldError[] = [];
		const team = await TeamModel.findOne({ _id: teamId });
		const userToAdd = await UserModel.findOne({ email });

		if (!team) {
			errors.push({ field: "general", message: "Could not find team" });
		} else if (team.memberIds?.includes(mongoose.Types.ObjectId(userToAdd?.id)))
			errors.push({ field: "email", message: "User aleady in team" });

		if (!validator.isEmail(email))
			errors.push({ field: "email", message: "Email is invalid" });
		else if (!userToAdd)
			errors.push({
				field: "email",
				message: "Could not find user with this email address",
			});
		else if (userToAdd?.id === payload?.userId) {
			errors.push({
				field: "email",
				message: "A team owner cannot invite himself",
			});
		}
		if (errors.length > 0) return { ok: false, errors };

		if (
			userToAdd &&
			userToAdd.id !== payload?.userId &&
			team &&
			payload?.userId &&
			String(team.ownerId) === payload.userId
		) {
			await TeamModel.updateOne(
				{ _id: team.id },
				{ $push: { memberIds: userToAdd.id } }
			);
			await UserModel.updateOne(
				{ _id: userToAdd.id },
				{ $push: { teamIds: team.id } }
			);
			return { ok: true, member: userToAdd };
		} else return { ok: false };
	}

	@Query(() => [User])
	@UseMiddleware(isAuthorized)
	async getTeamMembers(@Arg("teamId") teamId: string): Promise<User[]> {
		return await UserModel.find({
			teamIds: { $elemMatch: { $eq: teamId } },
		});
	}
}
