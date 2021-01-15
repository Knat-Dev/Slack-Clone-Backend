import {
	v2 as cloudinary,
	ConfigAndUrlOptions,
	UploadApiResponse,
} from "cloudinary";

const cloudinaryConfig: ConfigAndUrlOptions = {
	cloud_name: process.env.CLOUDINARY_NAME,
	api_key: process.env.CLOUDINARY_KEY,
	api_secret: process.env.CLOUDINARY_SECRET,
};

export const Cloudinary = {
	initialize: (): void => {
		cloudinary.config(cloudinaryConfig);
	},
	upload: async (file: string): Promise<string> => {
		const res: UploadApiResponse = await cloudinary.uploader.upload(file, {
			folder: "Chat_App_Assets",
		});

		return res.url;
	},
};
