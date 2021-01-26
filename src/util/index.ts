export * from "./RouteControllers";
import { mongoose } from "@typegoose/typegoose";
import { Response } from "express";
import { sign, verify } from "jsonwebtoken";
import { Error } from "mongoose";
import { MiddlewareFn, NextFn } from "type-graphql";
import { Context } from "../graphql/context";
import { TeamModel, User } from "../models";

export const isAuthorized: MiddlewareFn<Context> = (
	{ context },
	next: NextFn
) => {
	const { req } = context;
	const authorization = req.headers["authorization"];
	if (!authorization) throw new Error("Not authenticated");
	const token = authorization.split(" ")[1];
	try {
		const payload = verify(token, `${process.env.JWT_ACCESS_TOKEN_SECRET}`);
		context.payload = payload as { userId: string };
	} catch (e) {
		console.error(e.message);
		throw new Error("Not authenticated");
	}
	return next();
};

export const createAccessToken = (user: User): string => {
	return sign(
		{ userId: user.id, username: user.username },
		`${process.env.JWT_ACCESS_TOKEN_SECRET}`,
		{
			expiresIn: "15m",
		}
	);
};

export const createRefreshToken = (user: User): string => {
	return sign(
		{ userId: user.id, tokenVersion: user.tokenVersion },
		`${process.env.JWT_REFRESH_TOKEN_SECRET}`,
		{
			expiresIn: "7d",
		}
	);
};

export const sendRefreshToken = (res: Response, token: string): void => {
	res.cookie("nwid", token, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		domain: process.env.NODE_ENV === "production" ? ".knat.dev" : "localhost",
	});
};
