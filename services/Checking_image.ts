import AdmZip from "adm-zip";

/**
 * Validates or checks images inside the given input parameters ZIP file.
 *
 * This function is typically used to ensure that image assets included
 * in the dynamic input ZIP file are accessible or meet certain conditions
 * before being processed further in the Forge workflow.
 *
 * @param {any} INPUT_PARAMS_ZIP_URL_dynamic - The dynamic path or reference to the input parameters ZIP file.
 * @returns {*} The result of the validation process (e.g., success status, errors, or extracted image details).
 */

export function Check_image(INPUT_PARAMS_ZIP_URL_dynamic:any){
      let includeImage = false;
      try {
        const zip = new AdmZip(`${INPUT_PARAMS_ZIP_URL_dynamic}`);
        const entries = zip.getEntries();
     
        for (const entry of entries) {
          if (entry.entryName.endsWith(".json")) {
            const content = entry.getData().toString("utf-8");
            const json = JSON.parse(content);
     
            if (json?.Contourboundary?.Image) {
              includeImage = true;
              console.log("✅ Found Image in params.zip JSON:", json.Contourboundary.Image);
            }
          }
        }
     return includeImage;
      } catch (err) {
        console.warn("⚠️ Could not inspect params.zip, defaulting to no image:", err);
      }
}