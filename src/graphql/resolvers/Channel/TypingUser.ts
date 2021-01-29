import { Field, ID, ObjectType } from "type-graphql";
import { User } from "../../../models";

@ObjectType()
export class TypingUser {
	@Field(() => ID)
	id: User["id"];

	@Field(() => String)
	username: User["username"];

	@Field(() => Boolean)
	typing: boolean;

	@Field(() => String)
	channelId: string;
}
