import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.findFolders
import software.aws.toolkits.gradle.intellij.IdeVersions

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

        // different convention for intellij projects
        plugins.withType<ToolkitIntellijSubpluginPlugin> {
            val ideProfile = IdeVersions.ideProfile(project)
            java.srcDirs(findFolders(project, "it", ideProfile))
            resources.srcDirs(findFolders(project, "it-resources", ideProfile))
        }
    }
}

configurations.getByName("integrationTestCompileClasspath") {
    extendsFrom(configurations.getByName(JavaPlugin.TEST_COMPILE_CLASSPATH_CONFIGURATION_NAME))
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

val integTestTask = tasks.register<Test>("integrationTest") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the integration tests."
    testClassesDirs = integrationTests.output.classesDirs
    classpath = integrationTests.runtimeClasspath

    ciOnly {
        environment.remove("AWS_ACCESS_KEY_ID")
        environment.remove("AWS_SECRET_ACCESS_KEY")
        environment.remove("AWS_SESSION_TOKEN")
    }

    mustRunAfter(tasks.test)
}

tasks.check {
    dependsOn(integrationTests.compileJavaTaskName, integrationTests.getCompileTaskName("kotlin"))
}

afterEvaluate {
    plugins.withType<ToolkitIntellijSubpluginPlugin> {
        // weird implicit dependency issue, maybe with how the task graph works?
        // or because tests are on the ide classpath for some reason?
        tasks.named("classpathIndexCleanup") {
            mustRunAfter(tasks.named("compileIntegrationTestKotlin"))
        }

        // intellij plugin overrides with instrumented classes that we don't want or need
        integTestTask.configure {
            testClassesDirs = integrationTests.output.classesDirs
        }
    }
}
