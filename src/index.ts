/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApolloServer } from "apollo-server-express";
import cookie from "cookie";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { graphqlUploadExpress } from "graphql-upload";
import http from "http";
import Redis from "ioredis";
import { verify } from "jsonwebtoken";
import mongoose, { ConnectionOptions } from "mongoose";
import path from "path";
import "reflect-metadata";
import { buildSchema } from "type-graphql";
import {
	ChannelResolver,
	MessageResolver,
	NEW_TYPING_USER,
	NEW_USER_STATUS,
	TeamResolver,
	UserResolver,
} from "./graphql";
import { TypingUser } from "./graphql/resolvers/Channel/TypingUser";
import { ChannelModel, UserModel } from "./models";
import { refresh } from "./util";
dotenv.config();

// PORT
const port = 5000;

// Mongoose Connection Options
const mongooseConnectionOptions: ConnectionOptions = {
	useFindAndModify: false,
	useNewUrlParser: true,
	useUnifiedTopology: true,
};

(async () => {
	// Express App
	const app = express();
	// Express Middleware
	app.use(cors({ credentials: true, origin: process.env.CORS_ORIGIN }));
	app.use(cookieParser());
	app.use(express.json({ limit: "50mb" }));
	app.use(express.urlencoded({ limit: "50mb", extended: true }));
	app.use(graphqlUploadExpress({ maxFileSize: 1024 * 1024 * 20, maxFiles: 10 }));
	app.use("/files", express.static(path.join(__dirname, "../build/files")));
	app.set("trust proxy", 1); // for nginx
	// Express Routes
	app.post("/refresh", refresh);
	// Creating MongoDB Connection
	await mongoose.connect(`${process.env.MONGO_URL}`, mongooseConnectionOptions);
	console.log("Using RedisPubSub");
	console.log("MongoDB connection started.");
	// Setting up Apollo Server to work with the schema
	const options = {
		retryStrategy: (times: number) => {
			// reconnect after
			return Math.min(times * 50, 2000);
		},
	};
	const pubSub = new RedisPubSub({
		subscriber: new Redis(process.env.REDIS_URL, options),
		publisher: new Redis(process.env.REDIS_URL, options),
	});
	const apollo = new ApolloServer({
		uploads: false,
		subscriptions: {
			onDisconnect: async (ws, context) => {
				let ctx = null;
				try {
					ctx = await context.initPromise;
				} catch (e) {
					console.log("problem");
				}
				if (ctx) {
					const { userId } = ctx;
					try {
						const user = await UserModel.findOneAndUpdate(
							{ _id: userId, online: true },
							{ online: false },
							{ new: true }
						);
						const channel = await ChannelModel.findOneAndUpdate(
							{
								typingUserIds: { $elemMatch: { $eq: mongoose.Types.ObjectId(userId) } },
							},
							{ $pull: { typingUserIds: mongoose.Types.ObjectId(userId) } },
							{ new: true }
						);
						if (user) {
							await pubSub.publish(NEW_USER_STATUS, user);
							if (channel && !channel.typingUserIds?.includes(userId))
								await pubSub.publish<TypingUser>(NEW_TYPING_USER, {
									channelId: channel.id,
									username: user.username,
									id: user.id,
									typing: false,
								});
						}
						return true;
					} catch (e) {
						console.log(e);
						return false;
					}
				}
			},
			onConnect: async (connectionParams, _ws, context) => {
				const { token } = connectionParams as { token: string };

				if (token) {
					try {
						const data = verify(token, `${process.env.JWT_ACCESS_TOKEN_SECRET}`) as {
							userId: string;
							username: string;
						};
						if (data.userId) {
							const user = await UserModel.findOneAndUpdate(
								{ _id: data.userId },
								{ online: true },
								{ new: true }
							);
							if (user) {
								await pubSub.publish(NEW_USER_STATUS, user);
								return { userId: user.id };
							} else return false;
						} else {
							if (context.request.headers.cookie) {
								const parsedCookie = cookie.parse(context.request.headers.cookie) as {
									nwid: string;
								};
								const refreshToken: any = verify(
									parsedCookie.nwid,
									`${process.env.JWT_REFRESH_TOKEN_SECRET}`
								);
								if (refreshToken.userId) {
									const user = await UserModel.findOneAndUpdate(
										{ _id: refreshToken.userId },
										{ online: true },
										{ new: true }
									);
									if (user) {
										await pubSub.publish(NEW_USER_STATUS, user);
										return { userId: refreshToken.userId };
									}
								}
								return null;
							}
						}
					} catch (e) {
						if (context.request.headers.cookie) {
							const parsedCookie = cookie.parse(context.request.headers.cookie) as {
								nwid: string;
							};
							const refreshToken: any = verify(
								parsedCookie.nwid,
								`${process.env.JWT_REFRESH_TOKEN_SECRET}`
							);

							if (refreshToken.userId) {
								const user = await UserModel.findOneAndUpdate(
									{ _id: refreshToken.userId },
									{ online: true },
									{ new: true }
								);
								if (user) {
									await pubSub.publish(NEW_USER_STATUS, user);
									return { userId: refreshToken.userId };
								}
							}
							return null;
						}

						console.error("from onConnect:", e.message);
						return null;
					}
				} else {
					if (context.request.headers.cookie) {
						const parsedCookie = cookie.parse(context.request.headers.cookie) as {
							nwid: string;
						};
						const refreshToken: any = verify(
							parsedCookie.nwid,
							`${process.env.JWT_REFRESH_TOKEN_SECRET}`
						);
						if (refreshToken.userId) {
							const user = await UserModel.findOneAndUpdate(
								{ _id: refreshToken.userId },
								{ online: true },
								{ new: true }
							);
							if (user) {
								await pubSub.publish(NEW_USER_STATUS, user);
								return { userId: refreshToken.userId };
							}
						}
						return null;
					}
				}
			},
		},
		schema: await buildSchema({
			pubSub,
			dateScalarMode: "isoDate",
			resolvers: [UserResolver, ChannelResolver, TeamResolver, MessageResolver],
		}),
		context: async ({ req, res, connection }) => {
			// If we build the context for subscriptions, return the context generated in the onConnect callback.
			// In this example `connection.context` is `{ extended: 'context' }`
			if ((!req || !req.headers) && connection?.context) {
				return connection?.context;
			}

			// Build context for normal requests
			return { res, req, regular: "context" };
		},
		playground: {
			settings: {
				"request.credentials": "include",
			},
		},
	});
	apollo.applyMiddleware({ app, path: "/graphql", cors: false });
	const httpServer = http.createServer(app);
	apollo.installSubscriptionHandlers(httpServer);
	// Starting up Express Server
	httpServer.listen(port, () => {
		console.log(`GraphQL playground running at http://localhost:${port}/graphql`);
	});
})();
