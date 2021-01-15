import { Stream } from "stream";
import { Field, ObjectType } from "type-graphql";

@ObjectType()
export class FieldError {
	@Field()
	field: string;

	@Field()
	message: string;
}

@ObjectType()
export class Upload {
	name?: string;
	filename: string;
	mimetype: string;
	encoding: string;
	createReadStream: () => Stream;
}
