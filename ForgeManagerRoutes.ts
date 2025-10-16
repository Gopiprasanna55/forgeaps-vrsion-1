
import express, { Request, Response } from 'express';
import axios from 'axios';
import multer from "multer";
import archiver from "archiver";
import {
  generateForgeAccessToken,
  generateSignedURL,
  uploadFileToSignedUrl,
  completeForgeUpload,
  submitRevitWorkItem,
  INPUT_PARAMS_ZIP_URL_dynamic_read,
} from './ForgeManager';
import fs from 'fs';
import path from 'path';
import { handleFileUpload } from "./services/uploadService";
import { generateOutputUrls } from "./services/forgeOutputs";
import {clearUploadsFolder} from './services/Deleteupload_files';
import {Check_image} from "./services/Checking_image";

const  FORGE_BUCKET_ID = `w1zju1lsl1jx1vttsi4bqltnbpdymcgvdnoqnsw5sa5pwgil-designautomation`;
const OUTPUT_FILE_RVT=`outputFile.rvt`;
const OUTPUT_FILE_DWG=`outputFileDWG.dwg`;
const OUTPUT_FILE_DWG_IMG=`outputFileDWGImg.png`;



const upload = multer({ dest: 'uploads/' });
const router = express.Router();

// To Trace the Input params zip file path
let INPUT_PARAMS_ZIP = "" 




//Token generation route
router.post('/token', async (req, res) => {
    
  try {
    const token = await generateForgeAccessToken();

    res.json(token);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
//Signed url generation route
router.post('/signed-url', async (req, res) => {
const inputFile=process.env.INPUT_PARAMS_ZIP_URL?.split('\\').pop() || 'params.zip';
const forgeAccessToken=await generateForgeAccessToken().then(token => token.access_token);

  try {
    const url = await generateSignedURL(inputFile, forgeAccessToken);
    res.json({ signedUrl: url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Upload input files route

router.post('/upload-input-files', async (req, res) => {
 const {file}=req.body;

  try {
    const inputFiles = [
      {
        label: 'Revit File',
        path: "./Revit_Template_Metric.rvt",
      },
      {
        label: 'Params ZIP',
        path: file!,
      }
    ];

    const forgeAccessToken = await generateForgeAccessToken().then(t => t.access_token);

    const results = [];

    for (const input of inputFiles) {
      const filePath = input.path;

      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: `File not found: ${filePath}` });
      }

      const fileName = path.basename(filePath);

      // Generate signed URL for upload
      const signedUrlResponse: any = await generateSignedURL(fileName, forgeAccessToken);
      const signedUrl = signedUrlResponse.urls[0];
      const uploadKey = signedUrlResponse.uploadKey;

      // Upload file
      await uploadFileToSignedUrl(signedUrl, filePath);

      // Complete the upload
      const completeResult = await completeForgeUpload(uploadKey, fileName, forgeAccessToken);

      results.push({
        label: input.label,
        fileName,
        signedUrl,
        uploadKey,
        completeStatus: completeResult.status,
      });
    }

    res.json({
      success: true,
      uploadedFiles: results,
    });

  } catch (err: any) {
    console.error('Error uploading input files:', err);
    res.status(500).json({ error: err.message || 'An unknown error occurred' });
  }
});

// Generate output URLs route

router.post('/generate-output-urls', async (req, res) => {
  try {
    const accessToken = await generateForgeAccessToken().then(t => t.access_token);

    // List of output file names to generate signed URLs for
    const outputFiles = [
      'outputFile.rvt',
      'outputFileDWG.dwg',
      'outputSignedTitleBlockRvt.rvt',
      'outputSignedDWGImg.img'
    ];

    // Generate a signed URL (PUT) for each file
    const signedUrls = await Promise.all(
      outputFiles.map(async (fileName) => {
        const signedUrlResponse: any = await generateSignedURL(fileName, accessToken);
        return {
          fileName,
          url: signedUrlResponse.urls[0], // assuming one URL per file
        };
      })
    );

    // Format response
    const response = signedUrls.reduce((acc, { fileName, url }) => {
      acc[fileName] = url;
      return acc;
    }, {} as Record<string, string>);

    res.json({
      success: true,
      outputUrls: response,
    });

  } catch (err: any) {
    console.error('Error generating output URLs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

//Submit workitem route

router.post('/submit-workitem1', async (req, res) => {
  try {

    const {callbackURL}=req.body;

    const result = await submitRevitWorkItem(callbackURL);
    res.json({ success: true, workItemId: result.id, status: result.status });
  } catch (err: any) {
    console.error('Error submitting workitem:', err);
    res.status(500).json({ error: err.message });
  }
});


//callback designautomation route

router.post("/callback/designautomation", async (req: Request, res: Response) => {
  try {
    const { id, outputFileName: outputFileNameRaw, callbackURL } = req.query;
    const body = req.body;

   
    //  Always ACK Forge immediately
    res.status(200).send("ok");

    //  Download report log (for debugging)
    if (body.reportUrl) {
      const reportResponse = await axios.get(body.reportUrl);
      
    }

    // Get OAuth token
    const accessToken = await generateForgeAccessToken().then(t => t.access_token);
    
    // Files we expect from DA
    let foutputfile_data = [
      OUTPUT_FILE_RVT,
      OUTPUT_FILE_DWG,
   
    ];
    const flag=Check_image(INPUT_PARAMS_ZIP);
    console.log(flag)
    if(flag){
       foutputfile_data.push(OUTPUT_FILE_DWG_IMG);
    }
    

    // Get signed URLs for all outputs
    const results = await Promise.all(
      foutputfile_data.map(filename =>
        axios.get(
          `https://developer.api.autodesk.com/oss/v2/buckets/${FORGE_BUCKET_ID}/objects/${filename}/signeds3download`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { minutesExpiration: 15.0, useCdn: true },
          }
        )
      )
    );

    const signedUrls: { filename: string; url: string }[] = results.map((res, i) => ({
      filename: foutputfile_data[i]!,
      url: res.data.url,
    }));
   
   

    //  Build zip file with multiple files
    const buildFolder = path.join(__dirname, "outputFiles");
    if (!fs.existsSync(buildFolder)) fs.mkdirSync(buildFolder);

    const zipFilePath = path.join(buildFolder, `output.zip`);
    const zipStream = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(zipStream);

    // Directly append file streams into zip (no temp files, no nested folders)
    for (const file of signedUrls) {
      console.log("signed url",file.url);
      const response = await axios.get(file.url, { responseType: "stream" });
      archive.append(response.data, { name: path.basename(file.filename) });
    }

    await archive.finalize();

    await new Promise((resolve:any, reject) => {
      zipStream.on("finish", resolve);
      zipStream.on("error", reject);
    });



    //  Notify client with signed URLs + zip path
    const callbackDownload = await axios.post(callbackURL as string, {
      DownloadUrl: `${process.env.HOST_DOMAIN_URL}/forge/download`,
    });
    
    clearUploadsFolder();
  } catch (error: any) {
    console.error("❌ Callback error:", error.message);
  }
});

// main route 

router.post("/submit-workitem",upload.single('file'), async (req: Request, res: Response) => {
  try {

   
     if (!req.file) return res.status(400).json({ error: 'File not found' });
    
    const filePathread = req.file.path;
    const {callbackURL} = req.body;

    INPUT_PARAMS_ZIP=filePathread;
    const fileNamezip = req.file.originalname;
    INPUT_PARAMS_ZIP_URL_dynamic_read(filePathread,fileNamezip);

    // Step 1: Upload input files
     const uploadRes = await handleFileUpload(filePathread);

    // Step 2: Generate output URLs
    const outputRes = await generateOutputUrls();

    // Step 3: Submit workitem
    const workitemRes = await submitRevitWorkItem(callbackURL);
    res.json({
      workitemId: workitemRes.data.id,
      status: workitemRes.data.status,
    });
    
  } catch (err: any) {
    console.error("Error in submit:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/download", (req: Request, res: Response) => {
  const filePath = path.join(__dirname, "./outputFiles/output.zip"); 
 
  res.download(filePath, "Output_Files.zip", (err) => {
    if (err) {
      console.error("File download error:", err);
      res.status(500).send("Error downloading file.");
    }
  });
});
 

export default router;