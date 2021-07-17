import * as fs from 'fs'

/**
 * @param uniqueIdentifier unique identifier of state machine
 * @param cdkOutPath cdk.out path
 * @param stackName name of parent stack 
 * 
 * @returns the escaped ASL Json definition string of the state machine construct
 */
//export function getStateMachineDefinitionFromCfnTemplate(uniqueIdentifier: string, cdkOutPath: string, stackName: string) {
export function getStateMachineDefinitionFromCfnTemplate(uniqueIdentifier: string, templatePath: string) {

    try {
        //var data = fs.readFileSync(cdkOutPath + `/${stackName}.template.json`, 'utf8')
        var data = fs.readFileSync(templatePath, 'utf8')
        var jsonObj = JSON.parse(data)
        var resources = jsonObj.Resources

        for (var key of Object.keys(resources)) {
            if (key === 'CDKMetadata') continue

            var slicedKey = key.slice(0, -8)
            if (slicedKey === uniqueIdentifier) {
                jsonObj = jsonObj.Resources[`${key}`].Properties.DefinitionString["Fn::Join"][1]
                data = JSON.stringify(jsonObj)
                return data
            }
        }
        return ''
    }
    catch (e) {
        return ''
    }

}

/**
 * @param escaped json state machine construct definition 
 * @returns unescaped json state machine construct definition
 */
export function toUnescapedAslJson(escapedAslJsonStr: string) {
    if (typeof (escapedAslJsonStr) != "string") return escapedAslJsonStr;

    var refPrefix = '{"Ref":'
    var re1 = new RegExp(refPrefix, 'g')
    var refSuffix = '},""'
    var re2 = new RegExp(refSuffix, 'g')
    return escapedAslJsonStr
        .trim() //remove leading whitespaces
        .substring(1) //remove square brackets that wrap escapedAslJsonStr
        .slice(0, -1)
        .trim() //remove leading whitespaces
        .substring(1) //remove quotes that wrap escapedAslJsonStr
        .slice(0, -1)
        .replace(/\"\",/g, '') //remove empty quotes followed by a comma
        .replace(/\"\"/g, '') //remove empty quotes
        .replace(/\\/g, '') //remove backslashes
        .replace(re1, '') //remove Ref prefix
        .replace(re2, '') //remove Ref suffix
};