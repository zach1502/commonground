import type { ApiClient, components } from '@parkshape/api-client';
import type { DesignDocument, Parcel, ProjectParameters, Zone } from '@parkshape/core';

type Schemas = components['schemas'];
type Project = Schemas['Project'];
export type GeoJsonPolygon = Schemas['GeoJsonPolygon'];
export type SiteFeatures = Schemas['SiteFeaturesResult'];
export type ProposedFeature = Schemas['ProposedFeature'];
export type TerrainLoad = Schemas['TerrainResult'];
export type ProjectStatus = Project['status'];
export type Insights = Schemas['Insights'];
export type ProjectSummary = Schemas['ProjectSummary'];
export type InsightsHeatmap = Insights['heatmaps'][number];
export type ExportFormat = 'csv' | 'geojson' | 'dxf';

export type SiteQuery = { readonly parkName: string } | { readonly polygonWgs84: GeoJsonPolygon };

export interface NewProjectInput {
  readonly name: string;
  readonly parcel: Parcel;
  readonly heightmapRef: string;
  readonly parameters: ProjectParameters;
  readonly baselineDocument: DesignDocument;
  readonly zones: readonly Zone[];
  /** The last day of design and voting as an ISO date, or null for none. */
  readonly closesAt: string | null;
}

/** The staff-only calls behind the planner console. */
export interface StaffApi {
  loadSiteFeatures(query: SiteQuery): Promise<SiteFeatures>;
  loadTerrain(polygonWgs84: GeoJsonPolygon, resolutionM: number): Promise<TerrainLoad>;
  createProject(input: NewProjectInput): Promise<Project>;
  setProjectStatus(id: string, status: ProjectStatus): Promise<Project>;
  getInsights(projectId: string): Promise<Insights>;
  getSummary(projectId: string): Promise<ProjectSummary>;
}

export function staffCalls(client: ApiClient): StaffApi {
  return {
    async loadSiteFeatures(query) {
      return client.request('post', '/site-features', { body: query });
    },
    async loadTerrain(polygonWgs84, resolutionM) {
      return client.request('post', '/terrain', { body: { polygonWgs84, resolutionM } });
    },
    async createProject(input) {
      // The generated polygon types allow exactly 3 points (a known gap in the OpenAPI output),
      // so the core values, which the server parses again, pass through unchanged.
      const body = { ...input, zones: [...input.zones] } as unknown as Schemas['CreateProjectBody'];
      return client.request('post', '/projects', { body });
    },
    async setProjectStatus(id, status) {
      return client.request('patch', '/projects/{id}/status', { path: { id }, body: { status } });
    },
    async getInsights(projectId) {
      return client.request('get', '/projects/{id}/insights', { path: { id: projectId } });
    },
    async getSummary(projectId) {
      return client.request('get', '/projects/{id}/summary', { path: { id: projectId } });
    },
  };
}
