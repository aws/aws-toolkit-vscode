// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
}

dependencies {
    compileOnly(libs.detekt.api)

    testImplementation(libs.detekt.test)
    testImplementation(libs.junit4)
    testImplementation(libs.assertj)

    // only used to make test work
    testRuntimeOnly(libs.slf4j.api)
    testRuntimeOnly(libs.junit5.jupiterVintage)
}

tasks.test {
    useJUnitPlatform()
}

tasks.jar {
    duplicatesStrategy = DuplicatesStrategy.WARN
}
