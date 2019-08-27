const express = require('express');
const app = express();
const { exec } = require('child_process');

app.get('/start_blender', function (req, res) {
    exec('blender  --background --python modifier_sep.py', (err, stdout, stderr) => {
        if (err) {
          // node couldn't execute the command
          console.log('There is an error...');
          return;
        }
      
        // the *entire* stdout and stderr (buffered)
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
    });
    res.send('started');

});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
