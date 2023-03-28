// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("java")
    id("idea")
    id("toolkit-testing")
}

val integrationTests: SourceSet = sourceSets.maybeCreate("integrationTest")
sourceSets {
    integrationTests.apply {
        java.setSrcDirs(listOf("it"))
        resources.srcDirs(listOf("it-resources"))

        compileClasspath += main.get().output + test.get().output
        runtimeClasspath += main.get().output + test.get().output
    }
}

configurations.getByName("integrationTestCompileClasspath") {
    extendsFrom(configurations.getByName(JavaPlugin.TEST_COMPILE_CLASSPATH_CONFIGURATION_NAME))
    isCanBeResolved = true
}
configurations.getByName("integrationTestRuntimeClasspath") {
    extendsFrom(configurations.getByName(JavaPlugin.TEST_RUNTIME_CLASSPATH_CONFIGURATION_NAME))
    isCanBeResolved = true
}

// Add the integration test source set to test jar
val testJar = tasks.named<Jar>("testJar") {
    from(integrationTests.output)
}

idea {
    module {
        testSourceDirs = testSourceDirs + integrationTests.java.srcDirs
        testResourceDirs = testResourceDirs + integrationTests.resources.srcDirs
    }
}

tasks.register<Test>("integrationTest") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the integration tests."
    testClassesDirs = integrationTests.output.classesDirs
    classpath = integrationTests.runtimeClasspath

    mustRunAfter(tasks.test)
}

tasks.check {
    dependsOn(integrationTests.compileJavaTaskName, integrationTests.getCompileTaskName("kotlin"))
}
