import { getModelForClass, prop, Ref } from "@typegoose/typegoose";
import { Field, Float, ID, ObjectType } from "type-graphql";
import { Channel } from "../Channel";
import { Team } from "../Team";

@ObjectType()
export class User {
	@Field(() => ID)
	id: string;

	@Field()
	@prop({ required: true })
	public _username!: string;

	@Field()
	@prop({ required: true })
	public username!: string;

	@Field()
	@prop({ required: true })
	public email!: string;

	@Field(() => Boolean, { defaultValue: false })
	@prop({ default: false })
	public online?: boolean;

	@prop({ required: true })
	public password!: string;

	@Field()
	@prop({ default: 0 })
	public tokenVersion?: number;

	@prop({ default: [] })
	public teamIds?: Ref<Team>[];

	@Field(() => [Team], { defaultValue: [] })
	public teams?: Team[];

	@prop({ default: [] })
	public channelIds?: Ref<Channel>[];

	@Field(() => [Channel], { defaultValue: [] })
	public channels?: Channel[];

	@Field(() => Float)
	createdAt?: Date;

	@Field(() => Float)
	@prop({})
	updatedAt?: Date;
}

export const UserModel = getModelForClass(User, {
	schemaOptions: { timestamps: true },
});
