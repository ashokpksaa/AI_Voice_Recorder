const fs = require('fs');
const https = require('https');
const path = require('path');

// NEW LINK: Direct from GitHub Raw Server (More Stable)
const fileUrl = "https://raw.githubusercontent.com/jitsi/rnnoise-wasm/master/dist/rnnoise.wasm";
const fileName = "rnnoise.wasm";
const filePath = path.join(__dirname, fileName);

console.log(`🌐 Trying alternative source for ${fileName}...`);

const file = fs.createWriteStream(filePath);

https.get(fileUrl, function(response) {
    if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log(`✅ Success! '${fileName}' download ho gayi hai.`);
            console.log("📂 Folder check karein.");
        });
    } else {
        console.error(`❌ Still Failed. Status Code: ${response.statusCode}`);
        file.close();
        fs.unlink(filePath, () => {}); 
    }
}).on('error', function(err) { 
    fs.unlink(filePath, () => {});
    console.error(`❌ Error: ${err.message}`);
});