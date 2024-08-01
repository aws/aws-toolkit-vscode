// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("java-library")
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("toolkit-integration-testing")
}

dependencies {
    compileOnlyApi(project(":plugin-core:resources"))
    compileOnlyApi(project(":plugin-core:sdk-codegen"))

    api(libs.aws.cognitoidentity)
    api(libs.aws.ecr)
    api(libs.aws.ecs)
    api(libs.aws.lambda)
    api(libs.aws.s3)
    api(libs.aws.sso)
    api(libs.aws.ssooidc)
    api(libs.aws.sts)
    api(libs.bundles.jackson)
    implementation(libs.commonmark)
    testImplementation(libs.junit4)

    testRuntimeOnly(libs.junit5.jupiterVintage)
    testRuntimeOnly(project(":plugin-core:resources"))
    testRuntimeOnly(project(":plugin-core:sdk-codegen"))
}

tasks.test {
    useJUnitPlatform()
}
