// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

let response;

exports.lambdaHandler = async (event, context) => {
    try {
        response = {
            'statusCode': 200,
            'body': JSON.stringify({
                message: JSON.stringify(event).toUpperCase(),
            })
        }
    } catch (err) {
        console.log(err);
        return err;
    }

    return response
};
