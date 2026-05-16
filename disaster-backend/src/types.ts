export const ALLOWED_BEACH_LOCATIONS = [
	"pantai_lampuuk",
	"pantai_lhoknga",
	"pantai_ulee_lheue",
	"pantai_depok",
	"pantai_samas",
] as const;

export type BeachLocation = (typeof ALLOWED_BEACH_LOCATIONS)[number];

export type PredictionInput = {
	lik_codes: string[];
	beach_location: BeachLocation;
	clientReportId?: string;
	createdAtClient?: number;
	_experimentId?: string;
	is_active_warning?: boolean;
	active_warning?: string[];
	_channel?: string;
};

export type ContributionItem = {
	factor: string;
	label_id: string;
	label_en: string;
	category: "natural_sign" | "community";
	weight: number;
	direction: "increases_risk" | "neutral";
	detail_id: string;
	detail_en: string;
};

export type CommunityProfileFactor = {
	key: string;
	label_id: string;
	label_en: string;
	value: number;
	status: string;
	detail_id: string;
	detail_en: string;
};

export type ExplanationData = {
	summary_id: string;
	summary_en: string;
	contributions: ContributionItem[];
	community_profile: {
		beach: string;
		overall: string;
		factors: CommunityProfileFactor[];
	};
};

export type MlResult = {
	active_warning: string[];
	sign_description: string;
	community_characteristics: string;
	action_recommendation: string;
	triggered_lik_codes?: string[];
	explanation?: ExplanationData;
};

export type AckInput = {
	alertId: string;
	transport: "SSE" | "WS" | "PUSH";
	receivedAtClient: number;
	serverTimestamp: number;
	ackStage?: "DELIVERED" | "OPENED";
	// Optional fields you can add later:
	clientId?: string;
	// userId?: string;
};
