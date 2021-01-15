import {
	getModelForClass,
	modelOptions,
	prop,
	Ref,
	Severity,
} from "@typegoose/typegoose";
import { Field, Float, ID, ObjectType } from "type-graphql";
import { Team } from "../Team";
import { User } from "../User";

@ObjectType()
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class DirectMessage {
	@Field(() => ID)
	id: string;

	@Field({ nullable: true })
	@prop({ required: false })
	public text?: string;

	@Field({ nullable: true })
	@prop({ required: false })
	public url?: string;

	@Field({ nullable: true })
	@prop({ required: false })
	public filetype?: string;

	@prop({ required: true })
	public senderId!: Ref<User>;

	@Field(() => User)
	public sender?: User;

	@prop({ required: true })
	public receiverId!: Ref<User>;

	@Field(() => User)
	public receiver?: User;

	@prop({ required: true })
	public teamId!: Ref<Team>;

	@Field(() => Team)
	public team?: Team;

	@Field(() => Float)
	createdAt?: Date;

	@Field(() => Float)
	@prop({})
	updatedAt?: Date;
}

export const DirectMessageModel = getModelForClass(DirectMessage, {
	schemaOptions: { timestamps: true },
});
