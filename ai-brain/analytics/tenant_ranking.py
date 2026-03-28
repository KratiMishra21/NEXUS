class TenantRanking:
    def rank(self, tenant_results):
        scores = {}

        for tenant, data in tenant_results.items():
            avg_roi = sum(data["roi"].values()) / len(data["roi"]) if data["roi"] else 0
            avg_drop = sum(data["drop_offs"].values()) / len(data["drop_offs"]) if data["drop_offs"] else 0

            score = avg_roi - avg_drop
            scores[tenant] = round(score, 3)

        return dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))