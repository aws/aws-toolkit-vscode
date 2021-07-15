import * as fs from 'fs';

/**
 * @param uniqueIdentifier unique identifier of state machine
 * @param cdkOutPath cdk.out path
 * @param stackName name of parent stack 
 * 
 * @returns the ASL Json definition string of the state machine construct
 */
export function getStateMachineDefinitionFromCfnTemplate(uniqueIdentifier: string, cdkOutPath: string, stackName: string) {

    try {
        var data = fs.readFileSync(cdkOutPath + `/${stackName}.template.json`, 'utf8');
        var jsonObj = JSON.parse(data)
        var resources = jsonObj.Resources

        for (var key of Object.keys(resources)) {
            if (key === 'CDKMetadata') continue

            var slicedKey = key.slice(0, -8)
            if (slicedKey === uniqueIdentifier) {
                jsonObj = jsonObj.Resources[`${key}`].Properties.DefinitionString["Fn::Join"][1]
                data = JSON.stringify(jsonObj)
                data = unescape(data)
                return data
            }
        }
        return 'Wrong state machine identifier'
    }
    catch (e) {
        return 'Unable to get cfn definition for state machine'
    }

}

/**
 * Removes all backslashes, empty quotes, [] brackets and 
 * 
 * @param escaped json state machine construct definition 
 * @returns unescaped json state machine construct definition
 */
function unescape(escapedAslJsonStr: string) {
    if (typeof (escapedAslJsonStr) != "string") return escapedAslJsonStr;

    var helper1 = '{"Ref":'
    var re1 = new RegExp(helper1, 'g');
    var helper2 = '},""'
    var re2 = new RegExp(helper2, 'g')
    return escapedAslJsonStr
        .trim()
        .substring(1) //remove square brackets that wrap str
        .slice(0, -1)
        .trim()
        .substring(1) //remove quotes that wrap str
        .slice(0, -1)
        .replace(/\"\",/g, '') //remove empty quotes followed by a comma
        .replace(/\"\"/g, '') //remove empty quotes
        .replace(/\\/g, '') //remove backslashes
        .replace(re1, '') //remove all {"Ref": "%" }
        .replace(re2, '')
};