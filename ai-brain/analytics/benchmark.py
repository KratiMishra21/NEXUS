class BenchmarkEngine:
    def compare(self, tenant_results):
        global_roi = []
        global_drop = []

        for t in tenant_results.values():
            global_roi.extend(list(t["roi"].values()))
            global_drop.extend(list(t["drop_offs"].values()))

        avg_roi = sum(global_roi) / len(global_roi) if global_roi else 0
        avg_drop = sum(global_drop) / len(global_drop) if global_drop else 0

        insights = {}

        for tenant, data in tenant_results.items():
            t_roi = sum(data["roi"].values()) / len(data["roi"]) if data["roi"] else 0
            t_drop = sum(data["drop_offs"].values()) / len(data["drop_offs"]) if data["drop_offs"] else 0

            insights[tenant] = {
                "roi_vs_global": round(t_roi - avg_roi, 3),
                "drop_vs_global": round(t_drop - avg_drop, 3)
            }

        return insights