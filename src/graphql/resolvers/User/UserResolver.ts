import {
	DocumentType,
	modelOptions,
	mongoose,
	Severity,
} from "@typegoose/typegoose";
import { hash, compare } from "bcryptjs";
import { Error } from "mongoose";
import { verify } from "jsonwebtoken";
import validator from "validator";
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
import { Team, TeamModel, User, UserModel } from "../../../models";
import { Context } from "../../context";
import {
	createAccessToken,
	createRefreshToken,
	isAuthorized,
	sendRefreshToken,
} from "../../../util";
import { FieldError } from "../types";

@ObjectType()
class RegisterResponse {
	@Field({ nullable: true })
	ok?: boolean;

	@Field(() => [FieldError], { nullable: true })
	errors?: FieldError[];
}

@ObjectType()
class LoginResponse {
	@Field()
	accessToken: string;

	@Field({ nullable: true })
	user?: User;

	@Field(() => [FieldError], { nullable: true })
	errors?: FieldError[];
}

@Resolver(() => User)
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class UserResolver {
	@Query(() => String)
	@UseMiddleware(isAuthorized)
	hello(@Ctx() { payload }: Context): string {
		return `Your user id is: ${payload?.userId}`;
	}

	@Query(() => [User])
	async users(): Promise<DocumentType<User>[]> {
		return await UserModel.find();
	}

	// @Query(() => User, { nullable: true })
	// async me(@Ctx() context: Context): Promise<DocumentType<User> | null> {
	// 	const { req } = context;
	// 	const authorization = req.headers["authorization"];
	// 	console.log(authorization);
	// 	if (!authorization) return null;
	// 	const token = authorization.split(" ")[1];
	// 	console.log("me");

	// 	let payload: any;
	// 	try {
	// 		payload = verify(token, `${process.env.JWT_ACCESS_TOKEN_SECRET}`);
	// 		context.payload = payload as { userId: string };
	// 	} catch (e) {
	// 		console.error(e.message);
	// 		return null;
	// 	}
	// 	return await UserModel.findById(
	// 		mongoose.Types.ObjectId(`${context.payload.userId}`)
	// 	);
	// }

	@Mutation(() => RegisterResponse)
	async register(
		@Arg("username") username: string,
		@Arg("email") email: string,
		@Arg("password") password: string
	): Promise<RegisterResponse> {
		const errors: FieldError[] = [];
		let user: User | null;

		// VALIDATION START
		if (!email) {
			errors.push({ field: "email", message: "Must not be empty" });
		} else {
			user = await UserModel.findOne({ email: email.toLowerCase() });
			if (user) {
				errors.push({ field: "email", message: "Email address already exists" });
			} else if (!validator.isEmail(email))
				errors.push({ field: "email", message: "Email address is not valid" });
		}

		if (!username)
			errors.push({ field: "username", message: "Must not be empty" });
		else {
			user = await UserModel.findOne({ _username: username.toLowerCase() });
			if (user) {
				errors.push({
					field: "username",
					message: "Username already exists",
				});
			} else if (username.length < 3 || username.length > 24)
				errors.push({
					field: "username",
					message: "Username length must be 3 - 24 characters long",
				});
		}

		if (!password)
			errors.push({
				field: "password",
				message: "Must not be empty",
			});
		else if (password.length < 6)
			errors.push({
				field: "password",
				message: "Password length must be at least 6 characters long",
			});

		if (errors.length > 0) return { errors };
		// VALIDATION END

		try {
			const hashedPassword = await hash(password, 10);
			await UserModel.create({
				username,
				_username: username.toLowerCase(),
				email: email.toLowerCase(),
				password: hashedPassword,
			});

			return { ok: true };
		} catch (e) {
			console.error(e);
			return { ok: false };
		}
	}

	@Mutation(() => LoginResponse)
	async login(
		@Arg("usernameOrEmail") usernameOrEmail: string,
		@Arg("password") password: string,
		@Ctx() { res }: Context
	): Promise<LoginResponse> {
		const errors: FieldError[] = [];

		if (!usernameOrEmail)
			errors.push({ field: "usernameOrEmail", message: "Must not be empty" });
		else {
			const lowerCasedUsernameOrEmail = usernameOrEmail.toLowerCase();
			const user = await UserModel.findOne({
				$or: [
					{ _username: lowerCasedUsernameOrEmail },
					{ email: lowerCasedUsernameOrEmail },
				],
			});
			if (!user)
				errors.push({
					field: "usernameOrEmail",
					message: "Username or Email doesn't exist",
				});
			else {
				const valid = await compare(password, user.password);

				if (!valid)
					errors.push({ field: "usernameOrEmail", message: "Bad password" });

				sendRefreshToken(res, createRefreshToken(user));
				return {
					accessToken: createAccessToken(user),
					user,
				};
			}
		}
		return { accessToken: "", errors, user: undefined };
	}

	@Mutation(() => Boolean)
	async revokeRefreshTokenForUser(
		@Arg("userId") userId: string
	): Promise<boolean> {
		await UserModel.findOneAndUpdate(
			{ _id: userId },
			{ $inc: { tokenVersion: 1 } },
			{ new: true }
		);

		return true;
	}

	@Mutation(() => Boolean)
	async logout(@Ctx() { res }: Context): Promise<boolean> {
		sendRefreshToken(res, "");
		return true;
	}

	@Query(() => User, { nullable: true })
	async user(@Arg("id") id: string): Promise<User | null> {
		return await UserModel.findById(id);
	}

	@Query(() => [User], { defaultValue: [] })
	async allUsers(): Promise<User[]> {
		return await UserModel.find();
	}

	@Query(() => User)
	@UseMiddleware(isAuthorized)
	async me(@Ctx() { payload }: Context): Promise<User | null> {
		if (payload?.userId) {
			return await UserModel.findById(mongoose.Types.ObjectId(payload.userId));
		} else return null;
	}

	@FieldResolver(() => [Team])
	async teams(@Root() { id }: DocumentType<User>): Promise<Team[]> {
		const teams: Team[] = await TeamModel.find({
			$or: [
				{ ownerId: mongoose.Types.ObjectId(id) },
				{
					memberIds: {
						$elemMatch: { $eq: id },
					},
				},
			],
		}).sort({ name: 1 });
		return teams;
	}
}
