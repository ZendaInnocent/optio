/**
 * Thrown when the ImageRegistry encounters an error.
 */
export class ImageRegistryError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "ImageRegistryError";
  }
}

export interface ImageRegistryConfig {
  registryUrl?: string;
  username?: string;
  password?: string;
}

/**
 * Client for interacting with a Docker Registry HTTP API v2.
 * Supports pushing, listing, and deleting images from a container registry.
 */
export class ImageRegistry {
  private registryUrl: string;
  private authHeader?: string;

  constructor(config?: ImageRegistryConfig) {
    this.registryUrl =
      config?.registryUrl ??
      process.env.REGISTRY_URL ??
      (() => {
        throw new ImageRegistryError(
          "Registry URL not configured. Provide registryUrl in config or set REGISTRY_URL environment variable.",
        );
      })();

    if (config?.username && config?.password) {
      const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");
      this.authHeader = `Basic ${credentials}`;
    }
  }

  /**
   * Push an image tag to the registry.
   *
   * @param imageTag - Full image tag (e.g., "optio-agent-workspace1-repo1:v1.0.0")
   * @throws ImageRegistryError if the push fails
   */
  async push(imageTag: string): Promise<void> {
    const { name, tag } = this.parseImageTag(imageTag);
    const url = `${this.registryUrl}/v2/${name}/manifests/${tag}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: this.getHeaders({
        "Content-Type": "application/vnd.docker.distribution.manifest.v2+json",
      }),
    });

    if (!response.ok) {
      throw new ImageRegistryError(
        `Failed to push image ${imageTag}: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
  }

  /**
   * List images matching a pattern from the registry.
   *
   * @param pattern - Pattern to filter repositories (e.g., "optio-agent-workspace1")
   * @returns Array of full image tags (e.g., ["repo1:v1", "repo1:v2"])
   * @throws ImageRegistryError if the catalog fetch fails
   */
  async listImages(pattern: string): Promise<string[]> {
    const catalogUrl = `${this.registryUrl}/v2/_catalog`;
    const catalogResponse = await fetch(catalogUrl);

    if (!catalogResponse.ok) {
      throw new ImageRegistryError(
        `Failed to fetch registry catalog: ${catalogResponse.status} ${catalogResponse.statusText}`,
        catalogResponse.status,
      );
    }

    const catalog = (await catalogResponse.json()) as { repositories: string[] };
    const matchingRepos = catalog.repositories.filter((repo) => repo.includes(pattern));

    const images: string[] = [];
    for (const repo of matchingRepos) {
      const tagsUrl = `${this.registryUrl}/v2/${repo}/tags/list`;
      const tagsResponse = await fetch(tagsUrl);

      if (!tagsResponse.ok) {
        continue;
      }

      const tagsData = (await tagsResponse.json()) as { tags: string[] };
      for (const tag of tagsData.tags) {
        images.push(`${repo}:${tag}`);
      }
    }

    return images;
  }

  /**
   * Delete an image from the registry by its tag.
   *
   * @param imageTag - Full image tag to delete
   * @throws ImageRegistryError if the delete fails
   */
  async delete(imageTag: string): Promise<void> {
    const digest = await this.getImageDigest(imageTag);
    const { name } = this.parseImageTag(imageTag);
    const url = `${this.registryUrl}/v2/${name}/manifests/${digest}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new ImageRegistryError(
        `Failed to delete image ${imageTag}: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
  }

  /**
   * Get the content digest for a given image tag.
   *
   * @param imageTag - Full image tag
   * @returns The digest string (e.g., "sha256:abc123")
   * @throws ImageRegistryError if the fetch fails
   */
  async getImageDigest(imageTag: string): Promise<string> {
    const { name, tag } = this.parseImageTag(imageTag);
    const url = `${this.registryUrl}/v2/${name}/manifests/${tag}`;

    const response = await fetch(url, {
      method: "HEAD",
      headers: this.getHeaders({
        Accept: "application/vnd.docker.distribution.manifest.v2+json",
      }),
    });

    if (!response.ok) {
      throw new ImageRegistryError(
        `Failed to get digest for ${imageTag}: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const digest = response.headers.get("Docker-Content-Digest");
    if (!digest) {
      throw new ImageRegistryError(`No digest found for image ${imageTag}`);
    }

    return digest;
  }

  /**
   * Parse a full image tag into repository name and tag components.
   */
  private parseImageTag(imageTag: string): { name: string; tag: string } {
    const lastColon = imageTag.lastIndexOf(":");
    if (lastColon === -1) {
      throw new ImageRegistryError(
        `Invalid image tag format: ${imageTag}. Expected format: "name:tag"`,
      );
    }

    return {
      name: imageTag.slice(0, lastColon),
      tag: imageTag.slice(lastColon + 1),
    };
  }

  /**
   * Build request headers with optional auth.
   */
  private getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };

    if (this.authHeader) {
      headers.Authorization = this.authHeader;
    }

    return headers;
  }
}
