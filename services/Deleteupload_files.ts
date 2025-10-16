import fs from "fs";
import path from "path";

/**
 * Clears all files from the local uploads folder.
 *
 * This function is typically used to remove temporary input or output files
 * after they have been processed or uploaded to Forge, ensuring that the
 * local environment stays clean and does not consume unnecessary storage.
 *
 * @returns {void} Nothing is returned; the uploads folder is emptied.
 */

export function clearUploadsFolder() {
  const uploadsPath = path.join(__dirname, "../uploads"); // adjust if needed

  if (fs.existsSync(uploadsPath)) {
    fs.readdirSync(uploadsPath).forEach(file => {
      const filePath = path.join(uploadsPath, file);
      try {
        fs.unlinkSync(filePath);
        console.log("🗑️ Deleted:", filePath);
      } catch (err) {
        console.error("❌ Error deleting file:", filePath, err);
      }
    });
  }
}
