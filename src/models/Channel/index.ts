import {
	getModelForClass,
	modelOptions,
	prop,
	Ref,
	Severity,
} from "@typegoose/typegoose";
import { Field, Float, ID, ObjectType } from "type-graphql";
import { Message } from "../Message";
import { Team } from "../Team";
import { User } from "../User";

@ObjectType()
@modelOptions({ options: { allowMixed: Severity.ALLOW } })
export class Channel {
	@Field(() => ID)
	id: string;

	@Field()
	@prop({ required: true })
	public name!: string;

	@prop({ required: true })
	public teamId!: Ref<Team>;

	@Field(() => Team)
	public team?: Team;

	@Field()
	@prop()
	public public: boolean;

	@Field({ defaultValue: false })
	@prop({ default: false })
	public dm?: boolean;

	@Field(() => [Message], { defaultValue: [] })
	public messages?: Message[];

	@prop({ default: [] })
	public userIds?: Ref<User>[];

	@Field(() => [User], { defaultValue: [] })
	public users?: User[];

	@Field(() => Float)
	createdAt?: Date;

	@Field(() => Float)
	@prop({})
	updatedAt?: Date;
}

export const ChannelModel = getModelForClass(Channel, {
	schemaOptions: { timestamps: true },
});
