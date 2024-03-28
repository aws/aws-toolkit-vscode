// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

enum class CredentialSourceType {
    EC2_INSTANCE_METADATA, ECS_CONTAINER, ENVIRONMENT;

    companion object {
        fun parse(value: String): CredentialSourceType {
            if (value.equals("Ec2InstanceMetadata", ignoreCase = true)) {
                return EC2_INSTANCE_METADATA
            } else if (value.equals("EcsContainer", ignoreCase = true)) {
                return ECS_CONTAINER
            } else if (value.equals("Environment", ignoreCase = true)) {
                return ENVIRONMENT
            }
            throw IllegalArgumentException("'$value' is not a valid credential_source")
        }
    }
}
