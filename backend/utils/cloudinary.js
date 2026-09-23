import { v2 as cloudinary } from "cloudinary";

function configureCloudinary() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary credentials are missing.");
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export async function uploadOnCloudinary(localFilePath, passengerId) {
  configureCloudinary();
  // The caller removes the local file only after Cloudinary and MongoDB succeed.
  return cloudinary.uploader.upload(localFilePath, {
    folder: "dhaka-tesla-pool/passengers",
    public_id: passengerId,
    overwrite: true,
    invalidate: true,
    resource_type: "image",
  });
}

export async function deleteFromCloudinary(publicId) {
  configureCloudinary();
  return cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}
