#  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#  SPDX-License-Identifier: Apache-2.0
import json


def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": {"message": str(event).upper()},
    }
