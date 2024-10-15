const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const botVariables = require("./exportedBotFiles/BotVariables.json");
dotenv.config();

let token;

const throwError = (callee, error) => {
  console.log(arguments.callee.name);
  throw {
    Function: callee,
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause,
  };
};
const tokenGenerator = async (appId, secret) => {
  try {
    token = await jwt.sign({ appId }, secret);
    return token;  
  } catch (error) {
    console.error("Error uploading files:", error.message);
    throwError(tokenGenerator.name, error);
  }
};

const {
  PUBLIC_URL_PREFIX,
  IMPORT_BOT_ID,
  IMPORT_CLIENT_ID,
  IMPORT_CLIENT_SECRET,
  ADMIN_CLIENT_ID,
  ADMIN_CLIENT_SECRET,
} = process.env;

const uploadFiles = async (folderPath, fileToUpload) => {
  const items = fs.readdirSync(folderPath);
  let data = new FormData();
  items.forEach((item) => {
    const itemPath = path.join(folderPath, item);
    const stat = fs.statSync(itemPath); // Get stats to check if it's a file or directory
    if (item === fileToUpload && stat.isFile())
      data.append("file", fs.createReadStream(itemPath));
    data.append("fileContext", "bulkImport");
    data.append("fileExtension", "json");
  });
  let fileuploadConfig = {
    method: "post",
    maxBodyLength: Infinity,
    url: `${PUBLIC_URL_PREFIX}/public/uploadfile`,
    headers: {
      auth: token,
      ...data.getHeaders(),
    },
    data: data,
  };
  try {
    console.log(`${fileToUpload} File Upload is in progress, Please wait....`);
    const response = await axios.request(fileuploadConfig);
    return response.data;
  } catch (error) {
    console.error("Error uploading files:", error.message);
    throwError(uploadFiles.name, error);
  }
};
const importBotVariables = async (botID) => {
  let data = JSON.stringify(botVariables);

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: `${PUBLIC_URL_PREFIX}/1.1/public/builder/bot/${botID}/variables/import`,
    headers: {
      "Content-Type": "application/json",
      auth: token,
    },
    data: data,
  };

  try {
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    throwError(importBotVariables.name, error);
  }
};

const importFile = async (fileDetails) => {
  console.log("fileDetails", { ...fileDetails });
  let data = JSON.stringify({
    ...fileDetails,
  });

  let fileImportConfig = {
    method: "post",
    maxBodyLength: Infinity,
    url: `${PUBLIC_URL_PREFIX}/public/bot/${IMPORT_BOT_ID}/import`,
    headers: {
      auth: token,
      "content-type": "application/json",
    },
    data: data,
  };

  try {
    console.log(`Import is in progress, Please wait....`);
    const response = await axios.request(fileImportConfig);
    return response.data;
  } catch (error) {
    throwError(importFile.name, error);
  }
};

const importStatusCheck = async (bir_ID) => {
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: `${PUBLIC_URL_PREFIX}/public/bot/import/status/${bir_ID}`,
    headers: {
      auth: token,
    },
  };
  try {
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    throwError(importStatusCheck.name, error);
  }
};

const publishBot = async (botID) => {
  let data = JSON.stringify({
    versionComment: `Publishing from script on ${new Date(
      Date.now()
    ).toLocaleString()}`,
    initiateTraining:true,
  });

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: `${PUBLIC_URL_PREFIX}/public/bot/${botID}/publish`,
    headers: {
      auth: token,
      "content-type": "application/json",
    },
    data: data,
  };
  try {
    console.log(`publishBot`, config);
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    console.log(error);
    throwError(publishBot.name, error);
  }
};

const piblishBotStatus = async (botID) => {
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: `${PUBLIC_URL_PREFIX}/1.1/public/bot/${botID}/publish/status/`,
    headers: {
      Auth: token,
    },
  };

  try {
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    throwError(piblishBotStatus.name, error);
  }
};

const pollExportStatus = async (
  bir_ID,
  interval = 5000,
  maxRetries = 10,
  callback
) => {
  let attempts = 0;
  while (attempts < maxRetries) {
    const statusResponse = await callback(bir_ID);
    console.log("Current status:", {
      status: statusResponse?.status,
    });

    if (statusResponse.status !== "pending") {
      console.log(`Status is ${statusResponse?.status}, stoping retry`);
      return statusResponse; // Exit the loop if the status is not pending
    }

    console.log(
      `Import Status is ${statusResponse?.status}, retrying again in ${
        interval / 1000
      } seconds...`
    );
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  throw new Error("Max retries reached while polling export status.");
};
const folderPath = path.join(__dirname, "exportedBotFiles");
const importBot = async () => {
  try {
    const fileUploadDetails = {};
    const fileUploadDefinition = await uploadFiles(
      folderPath,
      "botDefinition.json"
    );
    fileUploadDetails.botDefinition = fileUploadDefinition.fileId;
    const fileUploadConfig = await uploadFiles(folderPath, "config.json");
    fileUploadDetails.configInfo = fileUploadConfig.fileId;
    token = await tokenGenerator(ADMIN_CLIENT_ID, ADMIN_CLIENT_SECRET);
    const importResponse = await importFile(fileUploadDetails);
    console.log(`importBotResponse`, importResponse);
    if (importResponse.status === "pending") {
      const bir_ID = importResponse._id;
      await pollExportStatus(bir_ID, 10000, 10, importStatusCheck);
    }
  } catch (error) {
    throwError(importBot.name, error);
  }
};

tokenGenerator(IMPORT_CLIENT_ID, IMPORT_CLIENT_SECRET).then(async (token) => {
  const importBotVariablesStatus = await importBotVariables(IMPORT_BOT_ID);
  console.log(`importBotVariablesStatus`, importBotVariablesStatus);
  await importBot();
  const publishData = await publishBot(IMPORT_BOT_ID);
  console.log(`publish Response`, publishData);
});
