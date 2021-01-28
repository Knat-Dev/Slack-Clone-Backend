import {
	getModelForClass,
	modelOptions,
	prop,
	Ref,
	Severity,
} from "@typegoose/typegoose";
import { Field, Float, ID, ObjectType } from "type-graphql";
import { Channel } from "../Channel";
import { User } from "../User";

@ObjectType()
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Message {
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
	public userId!: Ref<User>;

	@Field(() => User)
	public user?: User;

	@Field(() => String)
	@prop({ required: true })
	public channelId!: Ref<Channel>;

	@Field(() => Boolean, { defaultValue: false })
	@prop({ default: false })
	public edited!: boolean;

	@Field(() => Channel)
	public channel?: Channel;

	@Field(() => String)
	@prop()
	createdAt?: Date;

	@Field(() => String)
	@prop()
	updatedAt?: Date;
}

export const MessageModel = getModelForClass(Message, {
	schemaOptions: { timestamps: true },
});
