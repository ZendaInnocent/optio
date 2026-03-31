import { ImageRegistry } from "./ImageRegistry.js";

export interface CleanupConfig {
  registryUrl: string;
  /** Number of latest images to keep per workspace+repo (default: 5) */
  keepLatest?: number;
  /** Image prefix to filter (e.g., "optio-agent") */
  imagePrefix?: string;
  /** Optional auth credentials */
  username?: string;
  password?: string;
}

export interface CleanupResult {
  /** Number of images successfully deleted */
  deleted: number;
  /** Number of images kept (within retention limit) */
  kept: number;
  /** Number of images that failed to delete */
  failed: number;
  /** Errors encountered during cleanup */
  errors: string[];
  /** Summary of actions per workspace+repo */
  summaryByRepo: Record<string, { deleted: number; kept: number; failed: number }>;
}

interface ImageComponents {
  workspace: string;
  repo: string;
}

/**
 * Service for cleaning up old container images from the registry.
 * Keeps the latest N images per workspace+repo combination.
 */
export class ImageCleanupService {
  private registry: ImageRegistry;
  private keepLatest: number;
  private imagePrefix: string;

  constructor(config: CleanupConfig) {
    this.registry = new ImageRegistry({
      registryUrl: config.registryUrl,
      username: config.username,
      password: config.password,
    });
    this.keepLatest = config.keepLatest ?? 5;
    this.imagePrefix = config.imagePrefix ?? "optio-agent";
  }

  /**
   * Run cleanup across all images in the registry.
   *
   * @returns Summary of cleanup actions
   */
  async cleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      deleted: 0,
      kept: 0,
      failed: 0,
      errors: [],
      summaryByRepo: {},
    };

    console.warn(`[cleanup] Starting image cleanup (keepLatest=${this.keepLatest})`);

    const allImages = await this.registry.listImages(this.imagePrefix);
    console.warn(
      `[cleanup] Found ${allImages.length} images matching prefix "${this.imagePrefix}"`,
    );

    // Group images by workspace+repo
    const imagesByRepo = this.groupImagesByRepo(allImages);

    for (const [repoKey, images] of Object.entries(imagesByRepo)) {
      const repoResult = await this.cleanupRepo(repoKey, images);

      result.deleted += repoResult.deleted;
      result.kept += repoResult.kept;
      result.failed += repoResult.failed;
      result.errors.push(...repoResult.errors);
      result.summaryByRepo[repoKey] = {
        deleted: repoResult.deleted,
        kept: repoResult.kept,
        failed: repoResult.failed,
      };
    }

    console.warn(
      `[cleanup] Complete: deleted=${result.deleted}, kept=${result.kept}, failed=${result.failed}`,
    );

    return result;
  }

  /**
   * Clean up images for a specific workspace+repo.
   */
  private async cleanupRepo(
    repoKey: string,
    images: string[],
  ): Promise<{ deleted: number; kept: number; failed: number; errors: string[] }> {
    const result = { deleted: 0, kept: 0, failed: 0, errors: [] as string[] };

    // Sort images to determine order (by tag, assuming semantic or chronological ordering)
    const sortedImages = this.sortImages(images);

    // Keep the latest N images
    const toKeep = sortedImages.slice(0, this.keepLatest);
    const toDelete = sortedImages.slice(this.keepLatest);

    result.kept = toKeep.length;
    console.warn(
      `[cleanup] ${repoKey}: keeping ${toKeep.length} images, deleting ${toDelete.length}`,
    );

    for (const image of toDelete) {
      try {
        await this.registry.delete(image);
        result.deleted++;
        console.warn(`[cleanup] Deleted ${image}`);
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to delete ${image}: ${message}`);
        console.error(`[cleanup] Failed to delete ${image}: ${message}`);
      }
    }

    return result;
  }

  /**
   * Group images by their workspace+repo key.
   */
  private groupImagesByRepo(images: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    for (const image of images) {
      // Extract repo name (before the tag)
      const lastColon = image.lastIndexOf(":");
      if (lastColon === -1) continue;

      const repoName = image.slice(0, lastColon);

      if (!groups[repoName]) {
        groups[repoName] = [];
      }
      groups[repoName].push(image);
    }

    return groups;
  }

  /**
   * Sort images by tag, assuming newer versions/tags come first.
   * This is a simple sort; in production, you might want to use creation timestamps.
   */
  private sortImages(images: string[]): string[] {
    return [...images].sort((a, b) => {
      const tagA = a.split(":").pop() || "";
      const tagB = b.split(":").pop() || "";

      // Try semantic version comparison
      const semverA = this.parseSemver(tagA);
      const semverB = this.parseSemver(tagB);

      if (semverA && semverB) {
        return this.compareSemver(semverB, semverA); // Descending
      }

      // Fallback to string comparison (reverse chronological)
      return tagB.localeCompare(tagA);
    });
  }

  /**
   * Parse a tag as a semantic version if possible.
   */
  private parseSemver(tag: string): { major: number; minor: number; patch: number } | null {
    const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }

  /**
   * Compare two semantic versions.
   */
  private compareSemver(
    a: { major: number; minor: number; patch: number },
    b: { major: number; minor: number; patch: number },
  ): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
  }

  /**
   * Parse workspace and repo from an image name.
   *
   * @param imageName - Image name without tag (e.g., "optio-agent-workspace-repo")
   * @returns Workspace and repo components
   */
  parseImageComponents(imageName: string): ImageComponents {
    // Remove prefix
    const withoutPrefix = imageName.replace(`${this.imagePrefix}-`, "");

    // Split on first dash to get workspace, rest is repo
    const dashIndex = withoutPrefix.indexOf("-");
    if (dashIndex === -1) {
      return { workspace: withoutPrefix, repo: "" };
    }

    return {
      workspace: withoutPrefix.slice(0, dashIndex),
      repo: withoutPrefix.slice(dashIndex + 1),
    };
  }
}
