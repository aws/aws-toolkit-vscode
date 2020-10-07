// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0


val jacksonVersion: String by project
val kotlinVersion: String by project
val awsSdkVersion: String by project

val assertjVersion: String by project
val junitVersion: String by project
val mockitoVersion: String by project
val mockitoKotlinVersion: String by project
val ideaPluginVersion: String by project

buildscript {
    // This has to be here otherwise properties are not loaded and nothing works
    val props = java.util.Properties()
    file("${project.projectDir.parent}/gradle.properties").inputStream().use { props.load(it) }
    props.entries.forEach { it: Map.Entry<Any, Any> -> project.extensions.add(it.key.toString(), it.value) }
}

repositories {
    maven("https://plugins.gradle.org/m2/")
    mavenLocal()
    mavenCentral()
    jcenter()
}

plugins {
    `java-gradle-plugin`
    `kotlin-dsl`
}

sourceSets {
    main {
        java.srcDir("src")
    }
    test {
        java.srcDir("tst")
    }
}

dependencies {
    api("com.fasterxml.jackson.datatype:jackson-datatype-jsr310:$jacksonVersion")
    api("com.fasterxml.jackson.module:jackson-module-kotlin:$jacksonVersion")
    api("org.eclipse.jgit:org.eclipse.jgit:5.0.2.201807311906-r")
    api("com.atlassian.commonmark:commonmark:0.15.2")
    api("software.amazon.awssdk:codegen:$awsSdkVersion")

    implementation("org.jetbrains.intellij.plugins:gradle-intellij-plugin:$ideaPluginVersion")

    testImplementation("org.assertj:assertj-core:$assertjVersion")
    testImplementation("junit:junit:$junitVersion")
    testImplementation("com.nhaarman.mockitokotlin2:mockito-kotlin:$mockitoKotlinVersion")
    testImplementation("org.mockito:mockito-core:$mockitoVersion")
}

gradlePlugin {
    plugins {
        create("changeLog") {
            id = "toolkit-change-log"
            implementationClass = "software.aws.toolkits.gradle.changelog.ChangeLogPlugin"
        }
    }
}
