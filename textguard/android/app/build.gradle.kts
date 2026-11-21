plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.onyxmedia.textguard"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.onyxmedia.textguard"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        // Prefilled on the enrollment screen. 10.0.2.2 is the host machine from the emulator.
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"http://10.0.2.2:8787\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            buildConfigField("String", "DEFAULT_SERVER_URL", "\"https://textguard.example.com\"")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
