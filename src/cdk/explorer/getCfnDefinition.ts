import * as fs from 'fs';

/**
 * @param uniqueIdentifier unique identifier of state machine
 * @param cdkOutPath cdk.out path
 * @param stackName name of root stack of the project
 */
export function getCfnDefinitionForStateMachine(uniqueIdentifier: string, cdkOutPath: string, stackName: string) {

    try {
        console.log(cdkOutPath)
        var data = fs.readFileSync(cdkOutPath + `/${stackName}.template.json`, 'utf8');
        var jsonObj = JSON.parse(data)
        jsonObj = jsonObj.Resources[`${uniqueIdentifier}`].Properties.DefinitionString["Fn::Join"][1]
        data = JSON.stringify(jsonObj)
        data = escape(data)

        return data
    }
    catch (e) {

    }

}

function escape(str: string) {
    if (typeof (str) != "string") return str;

    var str1 = '{"Ref":'
    var re1 = new RegExp(str1, 'g');
    var str2 = '},""'
    var re2 = new RegExp(str2, 'g')
    return str
        .trim()
        .substring(1)
        .slice(0, -1)
        .trim()
        .substring(1)
        .slice(0, -1)
        .replace(/\"\",/g, '')
        .replace(/\"\"/g, '')
        .replace(/\\/g, '')
        .replace(re1, '')
        .replace(re2, '')
        ;
};