// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class RoleValidationTest {
    @Test
    fun validPolicyWithServiceString() {
        val rolePolicy = """
            {
              "Version": "2008-10-17",
              "Statement": [
                {
                  "Sid": "",
                  "Effect": "Allow",
                  "Principal": {
                    "AWS": "arn:aws:iam::012345678901:root",
                    "Service": "ecs-tasks.amazonaws.com" 
                  },
                  "Action": "sts:AssumeRole"
                }
              ]
            }
        """.trimIndent()
        assertThat(RoleValidation.isRolePolicyValidForCloudDebug(rolePolicy)).isTrue()
    }

    @Test
    fun validPolicyWithServiceArray() {
        val rolePolicy = """
            {
              "Version": "2008-10-17",
              "Statement": [
                {
                  "Sid": "",
                  "Effect": "Allow",
                  "Principal": {
                    "AWS": "arn:aws:iam::012345678901:root",
                    "Service": [
                      "ecs.amazonaws.com",
                      "ecs-tasks.amazonaws.com"
                    ]
                  },
                  "Action": "sts:AssumeRole"
                }
              ]
            }
        """.trimIndent()
        assertThat(RoleValidation.isRolePolicyValidForCloudDebug(rolePolicy)).isTrue()
    }

    @Test
    fun invalidPolicyWithDeny() {
        val rolePolicy = """
            {
              "Version": "2008-10-17",
              "Statement": [
                {
                  "Sid": "",
                  "Effect": "Deny",
                  "Principal": {
                    "AWS": "arn:aws:iam::012345678901:root",
                    "Service": "ecs-tasks.amazonaws.com" 
                  },
                  "Action": "sts:AssumeRole"
                }
              ]
            }
        """.trimIndent()
        assertThat(RoleValidation.isRolePolicyValidForCloudDebug(rolePolicy)).isFalse()
    }

    @Test
    fun invalidPolicyWithSomeOtherAction() {
        val rolePolicy = """
            {
              "Version": "2008-10-17",
              "Statement": [
                {
                  "Sid": "",
                  "Effect": "Allow",
                  "Principal": {
                    "AWS": "arn:aws:iam::012345678901:root",
                    "Service": "ecs-tasks.amazonaws.com" 
                  },
                  "Action": "sts:Whatever"
                }
              ]
            }
        """.trimIndent()
        assertThat(RoleValidation.isRolePolicyValidForCloudDebug(rolePolicy)).isFalse()
    }

    @Test
    fun invalidPolicyWithOtherServiceAsString() {
        val rolePolicy = """
            {
              "Version": "2008-10-17",
              "Statement": [
                {
                  "Sid": "",
                  "Effect": "Allow",
                  "Principal": {
                    "AWS": "arn:aws:iam::012345678901:root",
                    "Service": "lambda.amazonaws.com" 
                  },
                  "Action": "sts:AssumeRole"
                }
              ]
            }
        """.trimIndent()
        assertThat(RoleValidation.isRolePolicyValidForCloudDebug(rolePolicy)).isFalse()
    }

    @Test
    fun invalidPolicyWithOtherServiceInArray() {
        val rolePolicy = """
            {
              "Version": "2008-10-17",
              "Statement": [
                {
                  "Sid": "",
                  "Effect": "Allow",
                  "Principal": {
                    "AWS": "arn:aws:iam::012345678901:root",
                    "Service": [
                      "ecs.amazonaws.com",
                      "lambda.amazonaws.com"
                    ]
                  },
                  "Action": "sts:AssumeRole"
                }
              ]
            }
        """.trimIndent()
        assertThat(RoleValidation.isRolePolicyValidForCloudDebug(rolePolicy)).isFalse()
    }
}
