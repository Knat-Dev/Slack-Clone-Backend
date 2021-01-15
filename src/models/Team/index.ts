import {
	getModelForClass,
	modelOptions,
	prop,
	Ref,
	Severity,
} from "@typegoose/typegoose";
import { Field, Float, ID, ObjectType } from "type-graphql";
import { Channel } from "../Channel";
import { DirectMessage } from "../DirectMessage";
import { User } from "../User";

@ObjectType()
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Team {
	@Field(() => ID)
	id: string;

	@Field()
	@prop({ required: true })
	public name!: string;

	@prop({ required: true })
	public ownerId!: Ref<User>;

	@Field(() => User)
	public owner?: User;

	@Field(() => Boolean, { defaultValue: false })
	public admin?: boolean;

	@prop({ default: [] })
	public memberIds?: Ref<User>[];

	@Field(() => [User], { defaultValue: [] })
	public members?: User[];

	@Field(() => [User], { defaultValue: [] })
	public directMessages?: User[];

	@Field(() => Float)
	createdAt?: Date;

	@Field(() => Float)
	@prop({})
	updatedAt?: Date;
}

export const TeamModel = getModelForClass(Team, {
	schemaOptions: { timestamps: true },
});
