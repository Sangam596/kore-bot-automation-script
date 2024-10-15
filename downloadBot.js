const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const parse = require("url-parse");
const querystring = require("querystring");
const dotenv = require("dotenv");
const qs = require("qs");
const unzipper = require("unzipper");

dotenv.config();

const { EXPORT_BOT_ID, CLIENT_ID, CLIENT_SECRET, TOKEN_URL, PUBLIC_URL_PREFIX } =
  process.env;

let token;

const generateToken = async () => {
  const data = qs.stringify({
    identity: "Sakshi",
    clientId: CLIENT_ID,
    isAnonymous: "true",
    aud: "Nadagoudra",
  });

  const config = {
    method: "post",
    maxBodyLength: Infinity,
    url: TOKEN_URL,
    headers: {
      "x-api-key": CLIENT_SECRET,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data,
  };

  try {
    // const response = await axios.request(config);
    token = process.env.TOKEN;
    // response.data.jwt;
    return token; // Return the actual token data if needed
  } catch (error) {
    console.error("Error generating token:", error.message);
    throw error; // Re-throw error for handling upstream
  }
};

const exportBotApi = async (botID) => {
  try {
    if (!token) {
      token = await generateToken(CLIENT_ID, CLIENT_SECRET);
      console.log("TOKEN", token);
    }

    const data = JSON.stringify({
      exportType: "published",
      exportOptions: {
        settings: ["botSettings", "botVariables", "ivrSettings"],
        tasks: ["botTask", "knowledgeGraph", "smallTalk"],
        nlpData: [
          "utterances",
          "patterns",
          "traits",
          "rules",
          "concepts",
          "synonyms",
          "standardResponses",
          "nlpSettings",
        ],
      },
      subTasks: {
        alerts: [],
        actions: [],
        dialogs: [],
      },
      allTasks: true,
      customDashboards: true,
      IncludeDependentTasks: true,
    });

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `${PUBLIC_URL_PREFIX}/public/bot/${botID}/export`,
      headers: {
        auth: token,
        "Content-Type": "application/json",
      },
      data,
    };

    return await axios.request(config);
  } catch (error) {
    throw new Error(error.message);
  }
};

const exportStatus = async (botID) => {
  const config = {
    method: "get",
    maxBodyLength: Infinity,
    url: `${PUBLIC_URL_PREFIX}/public/bot/${botID}/export/status`,
    headers: {
      auth: token,
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    throw (error);
  }
};

const unzipFile = (zipFilePath, outputDir) => {
  console.log(`outputDir`, zipFilePath);
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipFilePath)
      .pipe(unzipper.Extract({ path: outputDir }))
      .on("close", resolve)
      .on("error", reject);
    fs.unlink(zipFilePath, (err) => {
      if (err) throw err;
      console.log(`File deleted successfully!! - ${zipFilePath}`);
    });
    //   const getIconPath = path.join(outputDir, 'icon.png');
    //   console.log(`getIconPath`,getIconPath);
    //   fs.unlinkSync(itemPath);
    //   fs.unlink(getIconPath,err=>{
    //     if(err) throw err;
    //     console.log(`File deleted successfully!! - ${zipFilePath}`);
    //   });
  });
};

const downloadBotZip = async (url, filePath) => {
  const config = {
    method: "get",
    maxBodyLength: Infinity,
    url,
    responseType: "stream",
  };

  try {
    const writer = fs.createWriteStream(filePath);
    const response = await axios.request(config);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    // console.error('Error downloading bot zip:', error);
    throw error.message; // Re-throw for handling upstream
  }
};

const pollExportStatus = async (botID, interval = 5000, maxRetries = 10,callback) => {
  let attempts = 0;

  while (attempts < maxRetries) {
    const statusResponse = await callback(botID);
    console.log("Current status:", statusResponse.status);

    if (statusResponse.status !== "pending") {
      return statusResponse.data.status; // Exit the loop if the status is not pending
    }

    console.log(
      `Status is pending, checking again in ${interval / 1000} seconds...`
    );
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  throw new Error("Max retries reached while polling export status.");
};

const exportBot = async (botID, folderPath) => {
  try {
    console.log("Starting export process for bot ID:", botID);

    const exportResponse = await exportBotApi(botID);
    console.log("Export response:", exportResponse.data.status);

    const statusResponse = await pollExportStatus(botID, 5000, 10, exportStatus);

    if (statusResponse.downloadURL) {
      const downloadURL = statusResponse.downloadURL;
      const parsedUrl = parse(downloadURL).query;
      const fileName = querystring.parse(parsedUrl).clientfilename;
      let filePath = path.join(folderPath, fileName);
      await downloadBotZip(downloadURL, filePath);
      console.log(`Downloaded bot zip to: ${filePath}`);
      await unzipFile(filePath, path.dirname(filePath));
    } else {
      console.log("No download URL found in status response.");
    }
  } catch (error) {
    console.error("Error during export:", error.message);
  }
};

const exportBotEnvVariables = async (botID, folderPath) => {
  try {
    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `${process.env.PUBLIC_URL_PREFIX}/1.1/public/builder/stream/${botID}/variables/export`,
      headers: {
        auth: token,
      },
    };
    const response = await axios.request(config);
    const fileContent = JSON.stringify(response.data);
    varaibleFile = path.join(folderPath, "BotVariables.json");
    await fs.writeFile(varaibleFile, fileContent, (err) => {
      if (err) console.log(err);
      else {
        console.log(`File written successfully into ${varaibleFile}`);
      }
    });
  } catch (error) {
    console.error("Error exporting bot environment variables:", error.message);
  }
};

const deleteAllFilesInFolder = async (folderPath) => {
  try {
    // Read the contents of the directory
    const items = fs.readdirSync(folderPath); // Synchronous read

    // Loop through each item
    items.forEach((item) => {
      const itemPath = path.join(folderPath, item);
      const stat = fs.statSync(itemPath); // Get stats to check if it's a file or directory

      if (stat.isFile()) {
        // If it's a file, delete it
        fs.unlinkSync(itemPath); // Synchronous delete
      } else if (stat.isDirectory()) {
        // If it's a directory, recursively delete its contents
        deleteAllFilesInFolder(itemPath);
        fs.rmdirSync(itemPath); // Remove the directory itself after emptying it
      }
    });

    console.log("All files and directories deleted successfully!");
  } catch (error) {
    console.error("Error deleting files:", error.message);
  }
};
// Example usage
const folderPath = path.join(__dirname, "exportedBotFiles"); // Change this to your target folder

// Generate the token before exporting
generateToken(CLIENT_ID, CLIENT_SECRET)
  .then(async () => {
    await deleteAllFilesInFolder(folderPath);
    await exportBot(EXPORT_BOT_ID, folderPath);
    await exportBotEnvVariables(EXPORT_BOT_ID, folderPath);
  })
  .catch((error) => {
    console.error("Error generating token and exporting:", error.message);
  });
