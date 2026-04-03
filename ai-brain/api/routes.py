from fastapi import APIRouter

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

from simulation.journey_simulator import JourneySimulator
from rag_advisor.advisor_bot import AdvisorBot

router = APIRouter()

@router.get("/run")
def run_pipeline():
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

    events = consumer.consume()
    sessions = session_engine.build_sessions(events)
    journeys = journey_engine.build_journeys(sessions)

    relationship_engine.process_journeys(journeys)

    analytics = analytics_service.run(journeys)

    original = simulator.simulate_conversion_rate(journeys)
    modified = simulator.simulate_removal(journeys, "KYC")
    new = simulator.simulate_conversion_rate(modified)

    simulation = {
        "original": original,
        "new": new
    }

    insights = advisor.generate_insights(analytics, simulation)

    neo4j_client.close()

    return {
        "journeys": journeys,
        "analytics": analytics,
        "simulation": simulation,
        "insights": insights
    }