import json


def lambda_handler(event, context):
    # pydevd 2020.1 can't break on the return here for 3.6 and 3.7
    x = 2 + 2
    return {
        "statusCode": 200,
        "body": {"message": str(event).upper()},
    }
