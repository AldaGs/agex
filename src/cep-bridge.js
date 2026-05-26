// src/cep-bridge.js
export const evalScript = (scriptName, args = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const csInterface = new window.CSInterface(); 
      
      // 1. Convert the object to a JSON string
      const jsonArgs = JSON.stringify(args);
      
      // 2. CRITICAL FIX: Escape single quotes and backslashes 
      // so they don't break the ExtendScript execution string
      const escapedArgs = jsonArgs.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      
      // 3. Format the call safely
      const scriptCall = `${scriptName}('${escapedArgs}')`;

      csInterface.evalScript(scriptCall, (result) => {
        if (result === "EvalScript error.") {
          reject(new Error(`ExtendScript Error in: ${scriptCall}`));
        } else {
          try {
            resolve(JSON.parse(result));
          } catch (e) {
            resolve(result); 
          }
        }
      });
    } catch (error) {
      reject(error);
    }
  });
};