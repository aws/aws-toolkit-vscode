// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import org.intellij.lang.annotations.Language

const val LAMBDA_PRINCIPAL = "lambda.amazonaws.com"

@Language("JSON")
val DEFAULT_LAMBDA_ASSUME_ROLE_POLICY =
    """
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Service": "lambda.amazonaws.com"
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }
    """.trim()

@Language("JSON")
val DEFAULT_POLICY =
    """
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          "Resource": "*"
        }
      ]
    }
    """.trim()

@Language("JSON")
fun createSqsPollerPolicy(arn: String): String =
    """
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes", 
            "sqs:ReceiveMessage"
          ],
          "Resource": "$arn"
        }
      ]
    }
    """.trim()
