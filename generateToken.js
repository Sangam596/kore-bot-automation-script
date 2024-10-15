const jwt = require('jsonwebtoken');

const tokenGenerator = async (appId, secret) =>{
    token =  jwt.sign({ appId}, secret);
    console.log("token",token);


    return token;
}

// console.log(tokenGenerator('cs-adf23d87-99f1-51fe-8e9a-23bd7a380fb0', 'f3Gj9PP85OIZQpt4vU+kogYEvJ90YLEcof85K2e9C60='));

module.exports.tokenGenerator = tokenGenerator;