// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val awsSdkVersion: String by project
val jacksonVersion: String by project
val junitVersion: String by project

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("toolkit-integration-testing")
}

dependencies {
    api(project(":resources"))
    api(project(":sdk-codegen"))

    api(libs.aws.cognitoidentity)
    api(libs.aws.ecr)
    api(libs.aws.ecs)
    api(libs.aws.lambda)
    api(libs.aws.s3)
    api(libs.aws.sso)
    api(libs.aws.ssooidc)
    api(libs.aws.sts)
    api(libs.bundles.jackson)

    testImplementation(libs.junit4)
}
