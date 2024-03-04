/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * @deprecated These are not easy to update if the related document changes...
 */

export function getDocumentSymbols(): vscode.DocumentSymbol[] {
    const namespaceSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
        'HelloWorld',
        '',
        vscode.SymbolKind.Namespace,
        new vscode.Range(12, 0, 48, 1),
        new vscode.Range(12, 10, 12, 20)
    )
    const classSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
        'HelloWorld.Function',
        '',
        vscode.SymbolKind.Class,
        new vscode.Range(15, 4, 47, 5),
        new vscode.Range(15, 17, 15, 25)
    )
    const privateMethodSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
        'GetCallingIP()',
        '',
        vscode.SymbolKind.Method,
        new vscode.Range(20, 8, 28, 9),
        new vscode.Range(20, 42, 20, 54)
    )
    const publicMethodSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
        'FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)',
        '',
        vscode.SymbolKind.Method,
        new vscode.Range(30, 8, 46, 9),
        new vscode.Range(30, 51, 30, 66)
    )

    namespaceSymbol.children.push(classSymbol)
    classSymbol.children.push(privateMethodSymbol)
    classSymbol.children.push(publicMethodSymbol)

    return [namespaceSymbol]
}

/**
 * @deprecated
 */
export function getFunctionText(): string {
    return String.raw`
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{

    public class Function
    {

        private static readonly HttpClient client = new HttpClient();

        private static async Task<string> GetCallingIP()
        {
            client.DefaultRequestHeaders.Accept.Clear();
            client.DefaultRequestHeaders.Add("User-Agent", "AWS Lambda .Net Client");

            var msg = await client.GetStringAsync("http://checkip.amazonaws.com/").ConfigureAwait(continueOnCapturedContext:false);

            return msg.Replace("\n","");
        }

        public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)
        {

            var location = await GetCallingIP();
            var body = new Dictionary<string, string>
            {
                { "message", "hello world" },
                { "location", location }
            };

            return new APIGatewayProxyResponse
            {
                Body = JsonSerializer.Serialize(body),
                StatusCode = 200,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } }
            };
        }
    }
}
`
}
