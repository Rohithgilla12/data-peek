import { NextRequest, NextResponse } from "next/server";
import { db, releases } from "@/db";
import { eq, desc } from "drizzle-orm";

interface UpdateCheckResponse {
  hasUpdate: boolean;
  latestVersion?: string;
  currentVersion?: string;
  downloadUrl?: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const currentVersion = searchParams.get("version");
    const platform = searchParams.get("platform"); // macos, macos-arm, windows, linux

    if (!currentVersion) {
      return NextResponse.json<UpdateCheckResponse>(
        { hasUpdate: false },
        { status: 400 },
      );
    }

    // Get the latest release
    const latestRelease = await db.query.releases.findFirst({
      where: eq(releases.isLatest, true),
      orderBy: [desc(releases.releasedAt)],
    });

    if (!latestRelease) {
      return NextResponse.json<UpdateCheckResponse>({
        hasUpdate: false,
        currentVersion,
      });
    }

    // Compare versions
    const hasUpdate =
      compareVersions(latestRelease.version, currentVersion) > 0;

    // Check if forced update is required
    const forceUpdate = latestRelease.minSupportedVersion
      ? compareVersions(latestRelease.minSupportedVersion, currentVersion) > 0
      : false;

    // Get the appropriate download URL based on platform
    let downloadUrl: string | undefined;
    switch (platform) {
      case "macos":
        downloadUrl = latestRelease.downloadUrlMac ?? undefined;
        break;
      case "macos-arm":
        downloadUrl = latestRelease.downloadUrlMacArm ?? undefined;
        break;
      case "windows":
        downloadUrl = latestRelease.downloadUrlWindows ?? undefined;
        break;
      case "linux":
        downloadUrl = latestRelease.downloadUrlLinux ?? undefined;
        break;
      default:
        // Return all URLs if platform not specified
        break;
    }

    return NextResponse.json<UpdateCheckResponse>({
      hasUpdate,
      latestVersion: latestRelease.version,
      currentVersion,
      downloadUrl,
      releaseNotes: latestRelease.releaseNotes ?? undefined,
      forceUpdate,
    });
  } catch (error) {
    console.error("Update check error:", error);
    return NextResponse.json<UpdateCheckResponse>(
      { hasUpdate: false },
      { status: 500 },
    );
  }
}
