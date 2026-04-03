from ingestion.mock_consumer import MockConsumer
from processing.session_engine import SessionEngine
from processing.journey_engine import JourneyEngine

from graph.neo4j_client import Neo4jClient
from graph.graph_builder import GraphBuilder
from graph.feature_relationships import FeatureRelationshipEngine

from analytics.funnel_analysis import FunnelAnalyzer
from analytics.zombie_detector import ZombieDetector
from analytics.roi_calculator import ROICalculator
from analytics.analytics_service import AnalyticsService

from analytics.tenant_ranking import TenantRanking
from analytics.benchmark import BenchmarkEngine

from simulation.journey_simulator import JourneySimulator
from rag_advisor.advisor_bot import AdvisorBot

from ml_models.churn_predictor import ChurnPredictor

from utils.data_loader import DataLoader
from utils.logger import get_logger


logger = get_logger("InsightOS")


def run_pipeline():
    # 🔹 Initialize core components
    consumer = MockConsumer()
    session_engine = SessionEngine()
    journey_engine = JourneyEngine()

    neo4j_client = Neo4jClient()
    graph_builder = GraphBuilder(neo4j_client)
    relationship_engine = FeatureRelationshipEngine(graph_builder)

    funnel_analyzer = FunnelAnalyzer()
    zombie_detector = ZombieDetector()
    roi_calculator = ROICalculator()

    analytics_service = AnalyticsService(
        funnel_analyzer,
        zombie_detector,
        roi_calculator
    )

    simulator = JourneySimulator()
    advisor = AdvisorBot()

    churn_model = ChurnPredictor()
    churn_model.train()

    ranking_engine = TenantRanking()
    benchmark_engine = BenchmarkEngine()

    try:
        events = consumer.consume()
        logger.info(f"Events consumed: {len(events)}")

        sessions = session_engine.build_sessions(events)

        journeys = journey_engine.build_journeys(sessions)
        logger.info(f"Journeys: {journeys}")
        structured_journeys = journeys
        raw_journeys = [j["journey"] for j in structured_journeys]

        relationship_engine.process_journeys(raw_journeys)
        logger.info("Graph updated successfully")

        tenant_results = analytics_service.run_multi_tenant(structured_journeys)

        logger.info(f"Tenant Analytics: {tenant_results}")

        tenant_churn = {}

        for tenant, data in tenant_results.items():
            churn_result = churn_model.predict(
                data["journeys"],
                data["analytics"]["drop_offs"],
                data["analytics"]["roi"]
            )

            tenant_churn[tenant] = churn_result

        logger.info(f"Tenant Churn: {tenant_churn}")

        rankings = ranking_engine.rank(
            {t: data["analytics"] for t, data in tenant_results.items()}
        )

        logger.info(f"Tenant Rankings: {rankings}")

        benchmarks = benchmark_engine.compare(
            {t: data["analytics"] for t, data in tenant_results.items()}
        )

        logger.info(f"Benchmark Insights: {benchmarks}")

        config = DataLoader.load_json("mock_data/config.json")
        feature_to_remove = config["simulation"]["remove_feature"]

        original_conversion = simulator.simulate_conversion_rate(raw_journeys)
        modified_journeys = simulator.simulate_removal(raw_journeys, feature_to_remove)
        new_conversion = simulator.simulate_conversion_rate(modified_journeys)

        logger.info(f"Original Conversion: {original_conversion}")
        logger.info(f"New Conversion (without {feature_to_remove}): {new_conversion}")

        global_results = analytics_service.run(raw_journeys)

        simulation_results = {
            "original": original_conversion,
            "new": new_conversion
        }

        insights = advisor.generate_insights(global_results, simulation_results)

        for insight in insights:
            logger.info(f"AI Insight: {insight}")

    except Exception as e:
        logger.error(f"Pipeline failed: {str(e)}")

    finally:
        neo4j_client.close()


if __name__ == "__main__":
    run_pipeline()