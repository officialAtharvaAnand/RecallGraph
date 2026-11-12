--
-- PostgreSQL database dump
--

\restrict Ah1ddUTBMMEIQg2u5sKJfoHnlwoarMXYIyxGBuLhK5jSVOJcmk6kusgKbGZCLzs

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: incident_status; Type: TYPE; Schema: public; Owner: recallgraph
--

CREATE TYPE public.incident_status AS ENUM (
    'open',
    'investigating',
    'resolved'
);


ALTER TYPE public.incident_status OWNER TO recallgraph;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: recallgraph
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'analyst'
);


ALTER TYPE public.user_role OWNER TO recallgraph;

--
-- Name: audit_incident(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.audit_incident() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
    VALUES(NEW.id,NEW.title,coalesce(actor,NEW.created_by),'created',jsonb_build_object('status',NEW.status));
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
      VALUES(NEW.id,NEW.title,actor,'status_changed',jsonb_build_object('from',OLD.status,'to',NEW.status));
    END IF;
    IF OLD.root_cause IS DISTINCT FROM NEW.root_cause THEN
      INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
      VALUES(NEW.id,NEW.title,actor,'root_cause_updated',jsonb_build_object('root_cause',NEW.root_cause));
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION public.audit_incident() OWNER TO recallgraph;

--
-- Name: audit_incident_delete(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.audit_incident_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
  VALUES(OLD.id,OLD.title,nullif(current_setting('app.current_user_id',true),'')::uuid,
         'deleted',jsonb_build_object('status',OLD.status));
  RETURN OLD;
END $$;


ALTER FUNCTION public.audit_incident_delete() OWNER TO recallgraph;

--
-- Name: enforce_status_transition(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.enforce_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status = 'resolved' THEN
    IF NEW.status <> 'investigating' OR current_setting('app.allow_reopen',true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Resolved incidents require reopen_incident()' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT ((OLD.status = 'open' AND NEW.status IN ('investigating','resolved')) OR
             (OLD.status = 'investigating' AND NEW.status IN ('open','resolved'))) THEN
    RAISE EXCEPTION 'Invalid incident status transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION public.enforce_status_transition() OWNER TO recallgraph;

--
-- Name: enqueue_graph_change(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.enqueue_graph_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE incident_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'incidents' THEN
    INSERT INTO graph_outbox(op,payload) VALUES(
      CASE WHEN TG_OP='DELETE' THEN 'delete_incident' ELSE 'upsert_incident' END,
      jsonb_build_object('id',CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END));
  ELSIF TG_TABLE_NAME = 'incident_symptoms' THEN
    incident_id := CASE WHEN TG_OP='DELETE' THEN OLD.incident_id ELSE NEW.incident_id END;
    INSERT INTO graph_outbox(op,payload) VALUES('upsert_incident',jsonb_build_object('id',incident_id));
  ELSIF TG_TABLE_NAME = 'services' THEN
    IF TG_OP <> 'DELETE' THEN
      INSERT INTO graph_outbox(op,payload) VALUES('upsert_service',jsonb_build_object('id',NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'symptoms' THEN
    IF TG_OP <> 'DELETE' THEN
      INSERT INTO graph_outbox(op,payload) VALUES('upsert_symptom',jsonb_build_object('id',NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'root_cause_categories' THEN
    IF TG_OP <> 'DELETE' THEN
      INSERT INTO graph_outbox(op,payload) VALUES('upsert_root_cause',jsonb_build_object('id',NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'service_dependencies' THEN
    INSERT INTO graph_outbox(op,payload) VALUES(
      CASE WHEN TG_OP='DELETE' THEN 'remove_dependency' ELSE 'set_dependency' END,
      jsonb_build_object('serviceId',CASE WHEN TG_OP='DELETE' THEN OLD.service_id ELSE NEW.service_id END,
        'dependsOnServiceId',CASE WHEN TG_OP='DELETE' THEN OLD.depends_on_service_id ELSE NEW.depends_on_service_id END));
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;


ALTER FUNCTION public.enqueue_graph_change() OWNER TO recallgraph;

--
-- Name: enqueue_graph_reference_delete(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.enqueue_graph_reference_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO graph_outbox(op,payload) VALUES (
    CASE TG_TABLE_NAME
      WHEN 'services' THEN 'delete_service'
      WHEN 'symptoms' THEN 'delete_symptom'
      ELSE 'delete_root_cause'
    END,
    jsonb_build_object('id', OLD.id)
  );
  RETURN OLD;
END $$;


ALTER FUNCTION public.enqueue_graph_reference_delete() OWNER TO recallgraph;

--
-- Name: reject_dependency_two_cycle(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.reject_dependency_two_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM service_dependencies
             WHERE service_id = NEW.depends_on_service_id
               AND depends_on_service_id = NEW.service_id) THEN
    RAISE EXCEPTION 'Direct dependency cycle is forbidden' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION public.reject_dependency_two_cycle() OWNER TO recallgraph;

--
-- Name: reject_future_incident(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.reject_future_incident() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Incident occurrence cannot be more than 5 minutes in the future'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION public.reject_future_incident() OWNER TO recallgraph;

--
-- Name: reopen_incident(uuid, text); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.reopen_incident(p_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE old_title text;
BEGIN
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reopen reason required' USING ERRCODE='P0001'; END IF;
  SELECT title INTO old_title FROM incidents WHERE id=p_id AND status='resolved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only resolved incidents can be reopened' USING ERRCODE='P0001'; END IF;
  PERFORM set_config('app.allow_reopen','on',true);
  UPDATE incidents SET status='investigating',resolved_at=NULL WHERE id=p_id;
  PERFORM set_config('app.allow_reopen','off',true);
  INSERT INTO incident_events(incident_id,incident_title,actor_id,event_type,detail)
  VALUES(p_id,old_title,nullif(current_setting('app.current_user_id',true),'')::uuid,
         'reopened',jsonb_build_object('reason',trim(p_reason)));
END $$;


ALTER FUNCTION public.reopen_incident(p_id uuid, p_reason text) OWNER TO recallgraph;

--
-- Name: resolve_incident(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.resolve_incident(p_id uuid, p_root_cause text, p_category_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE current_status incident_status;
BEGIN
  SELECT status INTO current_status FROM incidents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0001'; END IF;
  IF current_status = 'resolved' THEN RAISE EXCEPTION 'Incident already resolved' USING ERRCODE = 'P0001'; END IF;
  IF nullif(trim(p_root_cause),'') IS NULL THEN RAISE EXCEPTION 'Root cause required' USING ERRCODE = 'P0001'; END IF;
  IF p_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM root_cause_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Valid root cause category required' USING ERRCODE = 'P0001';
  END IF;
  UPDATE incidents SET status='resolved',root_cause=trim(p_root_cause),
    root_cause_category_id=p_category_id,resolved_at=now() WHERE id=p_id;
END $$;


ALTER FUNCTION public.resolve_incident(p_id uuid, p_root_cause text, p_category_id uuid) OWNER TO recallgraph;

--
-- Name: touch_incident(); Type: FUNCTION; Schema: public; Owner: recallgraph
--

CREATE FUNCTION public.touch_incident() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;


ALTER FUNCTION public.touch_incident() OWNER TO recallgraph;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: graph_outbox; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.graph_outbox (
    id bigint NOT NULL,
    op text NOT NULL,
    payload jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT graph_outbox_op_check CHECK ((op = ANY (ARRAY['upsert_incident'::text, 'delete_incident'::text, 'upsert_service'::text, 'delete_service'::text, 'upsert_symptom'::text, 'delete_symptom'::text, 'upsert_root_cause'::text, 'delete_root_cause'::text, 'set_dependency'::text, 'remove_dependency'::text])))
);


ALTER TABLE public.graph_outbox OWNER TO recallgraph;

--
-- Name: graph_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: recallgraph
--

ALTER TABLE public.graph_outbox ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.graph_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: incident_events; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.incident_events (
    id bigint NOT NULL,
    incident_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    happened_at timestamp with time zone DEFAULT now() NOT NULL,
    incident_title text NOT NULL,
    CONSTRAINT incident_events_event_type_check CHECK ((event_type = ANY (ARRAY['created'::text, 'status_changed'::text, 'root_cause_updated'::text, 'deleted'::text, 'reopened'::text])))
);


ALTER TABLE public.incident_events OWNER TO recallgraph;

--
-- Name: incident_events_id_seq; Type: SEQUENCE; Schema: public; Owner: recallgraph
--

ALTER TABLE public.incident_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.incident_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    service_id uuid NOT NULL,
    severity smallint NOT NULL,
    status public.incident_status DEFAULT 'open'::public.incident_status NOT NULL,
    root_cause text,
    occurred_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    root_cause_category_id uuid,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((((title || ' '::text) || summary) || ' '::text) || COALESCE(root_cause, ''::text)))) STORED,
    synthetic_seed text,
    CONSTRAINT incidents_check CHECK (((resolved_at IS NULL) OR (resolved_at >= occurred_at))),
    CONSTRAINT incidents_resolution_complete CHECK (((status <> 'resolved'::public.incident_status) OR ((resolved_at IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM root_cause), ''::text) IS NOT NULL) AND (root_cause_category_id IS NOT NULL)))),
    CONSTRAINT incidents_severity_check CHECK (((severity >= 1) AND (severity <= 5))),
    CONSTRAINT incidents_summary_check CHECK ((length(TRIM(BOTH FROM summary)) >= 10)),
    CONSTRAINT incidents_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 5) AND (length(TRIM(BOTH FROM title)) <= 180)))
);


ALTER TABLE public.incidents OWNER TO recallgraph;

--
-- Name: root_cause_categories; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.root_cause_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    CONSTRAINT root_cause_categories_label_check CHECK (((length(TRIM(BOTH FROM label)) >= 3) AND (length(TRIM(BOTH FROM label)) <= 80)))
);


ALTER TABLE public.root_cause_categories OWNER TO recallgraph;

--
-- Name: services; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_team text NOT NULL,
    CONSTRAINT services_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 100))),
    CONSTRAINT services_owner_team_check CHECK ((length(TRIM(BOTH FROM owner_team)) > 0))
);


ALTER TABLE public.services OWNER TO recallgraph;

--
-- Name: incident_resolution_stats; Type: VIEW; Schema: public; Owner: recallgraph
--

CREATE VIEW public.incident_resolution_stats AS
 SELECT s.id AS service_id,
    s.name AS service_name,
    c.id AS category_id,
    c.label AS category_label,
    count(*) AS resolution_count,
    avg((i.resolved_at - i.occurred_at)) AS avg_time_to_resolve
   FROM ((public.incidents i
     JOIN public.services s ON ((s.id = i.service_id)))
     JOIN public.root_cause_categories c ON ((c.id = i.root_cause_category_id)))
  WHERE (i.status = 'resolved'::public.incident_status)
  GROUP BY s.id, s.name, c.id, c.label;


ALTER VIEW public.incident_resolution_stats OWNER TO recallgraph;

--
-- Name: incident_symptoms; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.incident_symptoms (
    incident_id uuid NOT NULL,
    symptom_id uuid NOT NULL
);


ALTER TABLE public.incident_symptoms OWNER TO recallgraph;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO recallgraph;

--
-- Name: service_dependencies; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.service_dependencies (
    service_id uuid NOT NULL,
    depends_on_service_id uuid NOT NULL,
    CONSTRAINT service_dependencies_check CHECK ((service_id <> depends_on_service_id))
);


ALTER TABLE public.service_dependencies OWNER TO recallgraph;

--
-- Name: service_failure_summary; Type: VIEW; Schema: public; Owner: recallgraph
--

CREATE VIEW public.service_failure_summary AS
 SELECT s.id AS service_id,
    s.name AS service_name,
    count(i.id) AS incident_count,
    count(i.id) FILTER (WHERE (i.status <> 'resolved'::public.incident_status)) AS active_count,
    count(i.id) FILTER (WHERE ((i.status <> 'resolved'::public.incident_status) AND (i.severity >= 4))) AS critical_active_count,
    max(i.occurred_at) AS last_incident_at,
    round(avg(i.severity), 2) AS avg_severity
   FROM (public.services s
     LEFT JOIN public.incidents i ON ((i.service_id = s.id)))
  GROUP BY s.id, s.name;


ALTER VIEW public.service_failure_summary OWNER TO recallgraph;

--
-- Name: symptoms; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.symptoms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    CONSTRAINT symptoms_label_check CHECK (((length(TRIM(BOTH FROM label)) >= 3) AND (length(TRIM(BOTH FROM label)) <= 100)))
);


ALTER TABLE public.symptoms OWNER TO recallgraph;

--
-- Name: synthetic_seed_edges; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.synthetic_seed_edges (
    service_id uuid NOT NULL,
    depends_on_service_id uuid NOT NULL
);


ALTER TABLE public.synthetic_seed_edges OWNER TO recallgraph;

--
-- Name: synthetic_seed_rows; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.synthetic_seed_rows (
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    CONSTRAINT synthetic_seed_rows_table_name_check CHECK ((table_name = ANY (ARRAY['services'::text, 'symptoms'::text, 'root_cause_categories'::text])))
);


ALTER TABLE public.synthetic_seed_rows OWNER TO recallgraph;

--
-- Name: users; Type: TABLE; Schema: public; Owner: recallgraph
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role public.user_role DEFAULT 'analyst'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT users_email_check CHECK (((email = lower(email)) AND (length(email) <= 254)))
);


ALTER TABLE public.users OWNER TO recallgraph;

--
-- Name: graph_outbox graph_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.graph_outbox
    ADD CONSTRAINT graph_outbox_pkey PRIMARY KEY (id);


--
-- Name: incident_events incident_events_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incident_events
    ADD CONSTRAINT incident_events_pkey PRIMARY KEY (id);


--
-- Name: incident_symptoms incident_symptoms_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incident_symptoms
    ADD CONSTRAINT incident_symptoms_pkey PRIMARY KEY (incident_id, symptom_id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: root_cause_categories root_cause_categories_label_key; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.root_cause_categories
    ADD CONSTRAINT root_cause_categories_label_key UNIQUE (label);


--
-- Name: root_cause_categories root_cause_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.root_cause_categories
    ADD CONSTRAINT root_cause_categories_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: service_dependencies service_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.service_dependencies
    ADD CONSTRAINT service_dependencies_pkey PRIMARY KEY (service_id, depends_on_service_id);


--
-- Name: services services_name_key; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_name_key UNIQUE (name);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: symptoms symptoms_label_key; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.symptoms
    ADD CONSTRAINT symptoms_label_key UNIQUE (label);


--
-- Name: symptoms symptoms_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.symptoms
    ADD CONSTRAINT symptoms_pkey PRIMARY KEY (id);


--
-- Name: synthetic_seed_edges synthetic_seed_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.synthetic_seed_edges
    ADD CONSTRAINT synthetic_seed_edges_pkey PRIMARY KEY (service_id, depends_on_service_id);


--
-- Name: synthetic_seed_rows synthetic_seed_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.synthetic_seed_rows
    ADD CONSTRAINT synthetic_seed_rows_pkey PRIMARY KEY (table_name, record_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: events_incident_time_idx; Type: INDEX; Schema: public; Owner: recallgraph
--

CREATE INDEX events_incident_time_idx ON public.incident_events USING btree (incident_id, happened_at DESC);


--
-- Name: graph_outbox_pending_idx; Type: INDEX; Schema: public; Owner: recallgraph
--

CREATE INDEX graph_outbox_pending_idx ON public.graph_outbox USING btree (id) WHERE (processed_at IS NULL);


--
-- Name: incident_symptoms_symptom_idx; Type: INDEX; Schema: public; Owner: recallgraph
--

CREATE INDEX incident_symptoms_symptom_idx ON public.incident_symptoms USING btree (symptom_id);


--
-- Name: incidents_search_vector_idx; Type: INDEX; Schema: public; Owner: recallgraph
--

CREATE INDEX incidents_search_vector_idx ON public.incidents USING gin (search_vector);


--
-- Name: incidents_service_time_idx; Type: INDEX; Schema: public; Owner: recallgraph
--

CREATE INDEX incidents_service_time_idx ON public.incidents USING btree (service_id, occurred_at DESC);


--
-- Name: incidents_status_severity_idx; Type: INDEX; Schema: public; Owner: recallgraph
--

CREATE INDEX incidents_status_severity_idx ON public.incidents USING btree (status, severity);


--
-- Name: incidents_synthetic_seed_idx; Type: INDEX; Schema: public; Owner: recallgraph
--

CREATE INDEX incidents_synthetic_seed_idx ON public.incidents USING btree (synthetic_seed) WHERE (synthetic_seed IS NOT NULL);


--
-- Name: service_dependencies dependency_two_cycle; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER dependency_two_cycle BEFORE INSERT OR UPDATE ON public.service_dependencies FOR EACH ROW EXECUTE FUNCTION public.reject_dependency_two_cycle();


--
-- Name: service_dependencies graph_dependencies; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_dependencies AFTER INSERT OR DELETE ON public.service_dependencies FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_change();


--
-- Name: incident_symptoms graph_incident_symptoms; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_incident_symptoms AFTER INSERT OR DELETE ON public.incident_symptoms FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_change();


--
-- Name: incidents graph_incidents; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_incidents AFTER INSERT OR DELETE OR UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_change();


--
-- Name: root_cause_categories graph_root_causes; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_root_causes AFTER INSERT OR UPDATE ON public.root_cause_categories FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_change();


--
-- Name: root_cause_categories graph_root_causes_delete; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_root_causes_delete AFTER DELETE ON public.root_cause_categories FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_reference_delete();


--
-- Name: services graph_services; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_services AFTER INSERT OR UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_change();


--
-- Name: services graph_services_delete; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_services_delete AFTER DELETE ON public.services FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_reference_delete();


--
-- Name: symptoms graph_symptoms; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_symptoms AFTER INSERT OR UPDATE ON public.symptoms FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_change();


--
-- Name: symptoms graph_symptoms_delete; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER graph_symptoms_delete AFTER DELETE ON public.symptoms FOR EACH ROW EXECUTE FUNCTION public.enqueue_graph_reference_delete();


--
-- Name: incidents incidents_audit; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER incidents_audit AFTER INSERT OR UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.audit_incident();


--
-- Name: incidents incidents_audit_delete; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER incidents_audit_delete BEFORE DELETE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.audit_incident_delete();


--
-- Name: incidents incidents_occurrence_time; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER incidents_occurrence_time BEFORE INSERT OR UPDATE OF occurred_at ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.reject_future_incident();


--
-- Name: incidents incidents_status_transition; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER incidents_status_transition BEFORE UPDATE OF status ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.enforce_status_transition();


--
-- Name: incidents incidents_touch; Type: TRIGGER; Schema: public; Owner: recallgraph
--

CREATE TRIGGER incidents_touch BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.touch_incident();


--
-- Name: incident_events incident_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incident_events
    ADD CONSTRAINT incident_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: incident_symptoms incident_symptoms_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incident_symptoms
    ADD CONSTRAINT incident_symptoms_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_symptoms incident_symptoms_symptom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incident_symptoms
    ADD CONSTRAINT incident_symptoms_symptom_id_fkey FOREIGN KEY (symptom_id) REFERENCES public.symptoms(id) ON DELETE RESTRICT;


--
-- Name: incidents incidents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: incidents incidents_root_cause_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_root_cause_category_id_fkey FOREIGN KEY (root_cause_category_id) REFERENCES public.root_cause_categories(id) ON DELETE RESTRICT;


--
-- Name: incidents incidents_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE RESTRICT;


--
-- Name: service_dependencies service_dependencies_depends_on_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.service_dependencies
    ADD CONSTRAINT service_dependencies_depends_on_service_id_fkey FOREIGN KEY (depends_on_service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_dependencies service_dependencies_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: recallgraph
--

ALTER TABLE ONLY public.service_dependencies
    ADD CONSTRAINT service_dependencies_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Ah1ddUTBMMEIQg2u5sKJfoHnlwoarMXYIyxGBuLhK5jSVOJcmk6kusgKbGZCLzs

