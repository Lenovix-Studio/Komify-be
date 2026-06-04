--LIST function:
--fn_get_censorships
--fn_get_chapter_detail
--fn_get_chapters_by_comic
--fn_get_comic_metadata
--fn_get_homepage_comics
--fn_get_languages
--fn_get_statuses
--fn_import_comics
--fn_reset_all_data

-- DROP FUNCTION public.fn_get_censorships();

CREATE OR REPLACE FUNCTION public.fn_get_censorships()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb;
BEGIN

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'created_at', c.created_at,
                'updated_at', c.updated_at
            )
            ORDER BY c.name ASC
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM public.censorships c;

    RETURN v_result;

END;
$function$
;

-- DROP FUNCTION public.fn_get_chapter_detail(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_get_chapter_detail(p_comic_id uuid, p_chapter_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb;
BEGIN

    SELECT jsonb_build_object(
        'comic', jsonb_build_object(
            'id', cm.id,
            'legacy_id', cm.legacy_id,
            'title', cm.title,
            'alternative_title', cm.alternative_title,
            'cover_path', cm.cover_path,
            'seo_slug', cm.seo_slug
        ),

        'chapter', jsonb_build_object(
            'id', ch.id,

            'chapter_number', ch.chapter_number,
            'title', ch.title,

            'language', jsonb_build_object(
                'code', lang.code,
                'name', lang.name
            ),

            'censorship', jsonb_build_object(
                'id', cen.id,
                'name', cen.name
            ),

            'published_at', ch.published_at,

            'total_pages', ch.total_pages,

            'created_at', ch.created_at,
            'updated_at', ch.updated_at
        ),

        'navigation', jsonb_build_object(

            'prev_chapter', (
                SELECT jsonb_build_object(
                    'id', prev_ch.id,
                    'chapter_number', prev_ch.chapter_number,
                    'title', prev_ch.title
                )
                FROM chapters prev_ch
                WHERE
                    prev_ch.comic_id = ch.comic_id
                    AND prev_ch.deleted_at IS NULL
                    AND prev_ch.created_at < ch.created_at
                ORDER BY prev_ch.created_at DESC
                LIMIT 1
            ),

            'next_chapter', (
                SELECT jsonb_build_object(
                    'id', next_ch.id,
                    'chapter_number', next_ch.chapter_number,
                    'title', next_ch.title
                )
                FROM chapters next_ch
                WHERE
                    next_ch.comic_id = ch.comic_id
                    AND next_ch.deleted_at IS NULL
                    AND next_ch.created_at > ch.created_at
                ORDER BY next_ch.created_at ASC
                LIMIT 1
            )
        ),

        'pages', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', p.id,

                    'page_number', p.page_number,

                    'filename', p.filename,
                    'filepath', p.filepath,

                    'width', p.width,
                    'height', p.height,

                    'filesize', p.filesize,

                    'created_at', p.created_at
                )
                ORDER BY p.page_number ASC
            )
            FROM pages p
            WHERE p.chapter_id = ch.id
        ), '[]'::jsonb)

    )
    INTO v_result
    FROM chapters ch
    JOIN comics cm
        ON cm.id = ch.comic_id
    JOIN languages lang
        ON lang.code = ch.language_code
    JOIN censorships cen
        ON cen.id = ch.censorship_id
    WHERE
        ch.id = p_chapter_id
        AND ch.comic_id = p_comic_id
        AND ch.deleted_at IS NULL
    LIMIT 1;

    RETURN v_result;

END;
$function$
;

-- DROP FUNCTION public.fn_get_chapters_by_comic(uuid);

CREATE OR REPLACE FUNCTION public.fn_get_chapters_by_comic(p_comic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb;
BEGIN

    SELECT jsonb_build_object(
        'comic_id', p_comic_id,

        'total_chapters', COUNT(c.id),

        'data', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', c.id,

                    'chapter_number', c.chapter_number,
                    'title', c.title,

                    'language', jsonb_build_object(
                        'code', l.code,
                        'name', l.name
                    ),

                    'censorship', jsonb_build_object(
                        'id', cs.id,
                        'name', cs.name
                    ),

                    'published_at', c.published_at,

                    'total_pages', c.total_pages,

                    'created_at', c.created_at,
                    'updated_at', c.updated_at,

                    'pages', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', p.id,
                                'page_number', p.page_number,

                                'filename', p.filename,
                                'filepath', p.filepath,

                                'width', p.width,
                                'height', p.height,

                                'filesize', p.filesize,

                                'created_at', p.created_at
                            )
                            ORDER BY p.page_number ASC
                        )
                        FROM pages p
                        WHERE p.chapter_id = c.id
                    ), '[]'::jsonb)

                )
                ORDER BY
                    c.chapter_number ASC,
                    c.created_at ASC
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM chapters c
    JOIN languages l
        ON l.code = c.language_code
    JOIN censorships cs
        ON cs.id = c.censorship_id
    WHERE
        c.comic_id = p_comic_id
        AND c.deleted_at IS NULL;

    RETURN v_result;

END;
$function$
;

-- DROP FUNCTION public.fn_get_comic_metadata(uuid, int8);

CREATE OR REPLACE FUNCTION public.fn_get_comic_metadata(p_comic_id uuid DEFAULT NULL::uuid, p_legacy_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'id', c.id,
        'legacy_id', c.legacy_id,
        'seo_slug', c.seo_slug,
        'storage_key', c.storage_key,

        'title', c.title,
        'alternative_title', c.alternative_title,
        'description', c.description,

        'cover_path', c.cover_path,

        'source_name', c.source_name,
        'source_url', c.source_url,

        'published_at', c.published_at,

        'rating_score', c.rating_score,
        'rating_count', c.rating_count,
        'view_count', c.view_count,
        'total_chapters', c.total_chapters,

        'created_at', c.created_at,
        'updated_at', c.updated_at,

        'category', jsonb_build_object(
            'id', cat.id,
            'name', cat.name,
            'slug', cat.slug
        ),

        'status', jsonb_build_object(
            'id', st.id,
            'name', st.name
        ),

        'artists', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', a.id,
                    'name', a.name,
                    'slug', a.slug
                )
                ORDER BY a.name
            )
            FROM comic_artists ca
            JOIN tb_artists a ON a.id = ca.artist_id
            WHERE ca.comic_id = c.id
        ), '[]'::jsonb),

        'authors', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', a.id,
                    'name', a.name,
                    'slug', a.slug
                )
                ORDER BY a.name
            )
            FROM comic_authors ca
            JOIN tb_authors a ON a.id = ca.author_id
            WHERE ca.comic_id = c.id
        ), '[]'::jsonb),

        'characters', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', ch.id,
                    'name', ch.name,
                    'slug', ch.slug
                )
                ORDER BY ch.name
            )
            FROM comic_characters cc
            JOIN tb_characters ch ON ch.id = cc.character_id
            WHERE cc.comic_id = c.id
        ), '[]'::jsonb),

        'groups', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', g.id,
                    'name', g.name,
                    'slug', g.slug
                )
                ORDER BY g.name
            )
            FROM comic_groups cg
            JOIN tb_groups g ON g.id = cg.group_id
            WHERE cg.comic_id = c.id
        ), '[]'::jsonb),

        'parodies', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', p.name,
                    'slug', p.slug
                )
                ORDER BY p.name
            )
            FROM comic_parodies cp
            JOIN tb_parodies p ON p.id = cp.parody_id
            WHERE cp.comic_id = c.id
        ), '[]'::jsonb),

        'tags', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'name', t.name,
                    'slug', t.slug
                )
                ORDER BY t.name
            )
            FROM comic_tags ct
            JOIN tb_tags t ON t.id = ct.tag_id
            WHERE ct.comic_id = c.id
        ), '[]'::jsonb)

    )
    INTO v_result
    FROM comics c
    JOIN categories cat ON cat.id = c.category_id
    JOIN statuses st ON st.id = c.status_id
    WHERE
        (
            p_comic_id IS NOT NULL
            AND c.id = p_comic_id
        )
        OR
        (
            p_legacy_id IS NOT NULL
            AND c.legacy_id = p_legacy_id
        )
    LIMIT 1;

    RETURN v_result;
END;
$function$
;

-- DROP FUNCTION public.fn_get_homepage_comics(int4, int4);

CREATE OR REPLACE FUNCTION public.fn_get_homepage_comics(p_page integer DEFAULT 1, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_offset integer;
    v_total_data integer;
    v_total_pages integer;
    v_result jsonb;
BEGIN
    ---------------------------------------------------
    -- VALIDATION
    ---------------------------------------------------
    IF p_page < 1 THEN
        p_page := 1;
    END IF;

    IF p_limit < 1 THEN
        p_limit := 10;
    END IF;

    -- Max limit protection
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;

    ---------------------------------------------------
    -- OFFSET
    ---------------------------------------------------
    v_offset := (p_page - 1) * p_limit;

    ---------------------------------------------------
    -- TOTAL DATA
    ---------------------------------------------------
    SELECT COUNT(*)
    INTO v_total_data
    FROM comics c
    WHERE c.deleted_at IS NULL;

    ---------------------------------------------------
    -- TOTAL PAGE
    ---------------------------------------------------
    v_total_pages := CEIL(v_total_data::numeric / p_limit);

    ---------------------------------------------------
    -- RESULT
    ---------------------------------------------------
    WITH comic_data AS (
        SELECT
            c.id,
            c.legacy_id,
            c.title,
            c.alternative_title,

            c.cover_path,

            c.total_chapters,

            c.rating_score,
            c.rating_count,
            c.view_count,

            c.published_at,
            c.created_at,

            st.id AS status_id,
            st.name AS status_name,

            cat.id AS category_id,
            cat.name AS category_name,
            cat.slug AS category_slug

        FROM comics c
        JOIN statuses st
            ON st.id = c.status_id
        JOIN categories cat
            ON cat.id = c.category_id

        WHERE c.deleted_at IS NULL

        ORDER BY
            c.created_at DESC,
            c.legacy_id DESC

        LIMIT p_limit
        OFFSET v_offset
    )

    SELECT jsonb_build_object(
        'pagination', jsonb_build_object(
            'page', p_page,
            'limit', p_limit,
            'total_data', v_total_data,
            'total_pages', v_total_pages,
            'has_next', p_page < v_total_pages,
            'has_prev', p_page > 1
        ),

        'data', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cd.id,
                    'legacy_id', cd.legacy_id,

                    'title', cd.title,
                    'alternative_title', cd.alternative_title,

                    'cover_path', cd.cover_path,

                    'total_chapters', cd.total_chapters,

                    'rating_score', cd.rating_score,
                    'rating_count', cd.rating_count,

                    'view_count', cd.view_count,

                    'published_at', cd.published_at,
                    'created_at', cd.created_at,

                    'status', jsonb_build_object(
                        'id', cd.status_id,
                        'name', cd.status_name
                    ),

                    'category', jsonb_build_object(
                        'id', cd.category_id,
                        'name', cd.category_name,
                        'slug', cd.category_slug
                    ),

                    'tags', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', t.id,
                                'name', t.name,
                                'slug', t.slug
                            )
                            ORDER BY t.name
                        )
                        FROM comic_tags ct
                        JOIN tb_tags t
                            ON t.id = ct.tag_id
                        WHERE ct.comic_id = cd.id
                    ), '[]'::jsonb)

                )
                ORDER BY cd.created_at DESC
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM comic_data cd;

    RETURN v_result;
END;
$function$
;

-- DROP FUNCTION public.fn_get_languages();

CREATE OR REPLACE FUNCTION public.fn_get_languages()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb;
BEGIN

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'code', l.code,
                'name', l.name,
                'created_at', l.created_at,
                'updated_at', l.updated_at
            )
            ORDER BY l.name ASC
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM public.languages l;

    RETURN v_result;

END;
$function$
;

-- DROP FUNCTION public.fn_get_statuses();

CREATE OR REPLACE FUNCTION public.fn_get_statuses()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb;
BEGIN

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'created_at', s.created_at,
                'updated_at', s.updated_at
            )
            ORDER BY s.name ASC
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM public.statuses s;

    RETURN v_result;

END;
$function$
;

-- DROP FUNCTION public.fn_import_comics(jsonb);

CREATE OR REPLACE FUNCTION public.fn_import_comics(p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_comic jsonb;
    v_chapter jsonb;
    v_page jsonb;

    v_comic_id uuid;
    v_chapter_id uuid;

    v_category_id uuid;
    v_status_id uuid;
    v_censorship_id uuid;

    v_language_code varchar(5);
    v_page_index int;

    v_categories jsonb;
    v_tags jsonb;
    v_groups jsonb;
    v_parodies jsonb;
    v_artists jsonb;
    v_authors jsonb;
    v_characters jsonb;

BEGIN

    -- =====================================================
    -- ENSURE DEFAULT MASTER DATA
    -- =====================================================

    INSERT INTO public.censorships(name)
    VALUES ('mosaic censorship')
    ON CONFLICT (name) DO NOTHING;

    SELECT id INTO v_censorship_id
    FROM public.censorships
    WHERE name = 'mosaic censorship'
    LIMIT 1;

    INSERT INTO public.categories(name, slug)
    VALUES ('uncategorized', 'uncategorized')
    ON CONFLICT (slug) DO NOTHING;

    INSERT INTO public.statuses(name)
    VALUES ('Unknown')
    ON CONFLICT (name) DO NOTHING;

    -- =====================================================
    -- LOOP COMICS
    -- =====================================================

    FOR v_comic IN
        SELECT *
        FROM jsonb_array_elements(p_data)
    LOOP

        -- =================================================
        -- SAFE NORMALIZER
        -- array/string/null -> array
        -- =================================================

        v_categories :=
            CASE
                WHEN jsonb_typeof(v_comic->'categories') = 'array'
                    THEN v_comic->'categories'

                WHEN jsonb_typeof(v_comic->'categories') = 'string'
                    THEN to_jsonb(ARRAY[v_comic->>'categories'])

                ELSE '["uncategorized"]'::jsonb
            END;

        v_tags :=
            CASE
                WHEN jsonb_typeof(v_comic->'tags') = 'array'
                    THEN v_comic->'tags'

                WHEN jsonb_typeof(v_comic->'tags') = 'string'
                    THEN to_jsonb(ARRAY[v_comic->>'tags'])

                ELSE '[]'::jsonb
            END;

        v_groups :=
            CASE
                WHEN jsonb_typeof(v_comic->'groups') = 'array'
                    THEN v_comic->'groups'

                WHEN jsonb_typeof(v_comic->'groups') = 'string'
                    THEN to_jsonb(ARRAY[v_comic->>'groups'])

                ELSE '[]'::jsonb
            END;

        v_parodies :=
            CASE
                WHEN jsonb_typeof(v_comic->'parodies') = 'array'
                    THEN v_comic->'parodies'

                WHEN jsonb_typeof(v_comic->'parodies') = 'string'
                    THEN to_jsonb(ARRAY[v_comic->>'parodies'])

                ELSE '[]'::jsonb
            END;

        v_artists :=
            CASE
                WHEN jsonb_typeof(v_comic->'artists') = 'array'
                    THEN v_comic->'artists'

                WHEN jsonb_typeof(v_comic->'artists') = 'string'
                    THEN to_jsonb(ARRAY[v_comic->>'artists'])

                ELSE '["unknown artist"]'::jsonb
            END;

        v_authors :=
            CASE
                WHEN jsonb_typeof(v_comic->'authors') = 'array'
                    THEN v_comic->'authors'

                WHEN jsonb_typeof(v_comic->'authors') = 'string'
                    THEN to_jsonb(ARRAY[v_comic->>'authors'])

                ELSE '["unknown author"]'::jsonb
            END;

        v_characters :=
            CASE
                WHEN jsonb_typeof(v_comic->'characters') = 'array'
                    THEN v_comic->'characters'

                WHEN jsonb_typeof(v_comic->'characters') = 'string'
                    THEN to_jsonb(ARRAY[v_comic->>'characters'])

                ELSE '[]'::jsonb
            END;

        -- =================================================
        -- CATEGORY
        -- =================================================

        INSERT INTO public.categories(name, slug)
        SELECT DISTINCT
            trim(c),
            regexp_replace(lower(trim(c)), '[^a-z0-9]+', '-', 'g')
        FROM jsonb_array_elements_text(v_categories) c
        WHERE trim(c) <> ''
        ON CONFLICT (slug) DO NOTHING;

        SELECT id
        INTO v_category_id
        FROM public.categories
        WHERE slug = regexp_replace(
            lower(trim(v_categories->>0)),
            '[^a-z0-9]+',
            '-',
            'g'
        )
        LIMIT 1;

        IF v_category_id IS NULL THEN
            SELECT id
            INTO v_category_id
            FROM public.categories
            WHERE slug = 'uncategorized'
            LIMIT 1;
        END IF;

        -- =================================================
        -- STATUS
        -- =================================================

        INSERT INTO public.statuses(name)
        VALUES (
            COALESCE(
                NULLIF(trim(v_comic->>'status'), ''),
                'Unknown'
            )
        )
        ON CONFLICT (name) DO NOTHING;

        SELECT id
        INTO v_status_id
        FROM public.statuses
        WHERE name = COALESCE(
            NULLIF(trim(v_comic->>'status'), ''),
            'Unknown'
        )
        LIMIT 1;

        -- =================================================
        -- COMIC UPSERT
        -- =================================================

        SELECT id
        INTO v_comic_id
        FROM public.comics
        WHERE legacy_id = (v_comic->>'slug')::bigint
        LIMIT 1;

        IF v_comic_id IS NULL THEN

            INSERT INTO public.comics (
                legacy_id,
                title,
                category_id,
                status_id,
                cover_path,
                published_at,
                total_chapters,
                created_at,
                updated_at
            )
            VALUES (
                (v_comic->>'slug')::bigint,
                COALESCE(
                    NULLIF(trim(v_comic->>'title'), ''),
                    'Untitled'
                ),
                v_category_id,
                v_status_id,
                v_comic->>'cover',
                (v_comic->>'uploaded')::timestamptz,
                jsonb_array_length(
                    COALESCE(v_comic->'chapters', '[]'::jsonb)
                ),
                now(),
                now()
            )
            RETURNING id INTO v_comic_id;

        END IF;

        -- =================================================
        -- TAGS
        -- =================================================

        INSERT INTO public.tb_tags(name, slug, created_at, updated_at)
        SELECT DISTINCT
            trim(t),
            regexp_replace(lower(trim(t)), '[^a-z0-9]+', '-', 'g'),
            now(),
            now()
        FROM jsonb_array_elements_text(v_tags) t
        WHERE trim(t) <> ''
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO public.comic_tags(comic_id, tag_id, created_at)
        SELECT DISTINCT
            v_comic_id,
            t.id,
            now()
        FROM public.tb_tags t
        WHERE t.slug IN (
            SELECT regexp_replace(lower(trim(x)), '[^a-z0-9]+', '-', 'g')
            FROM jsonb_array_elements_text(v_tags) x
        )
        ON CONFLICT DO NOTHING;

        -- =================================================
        -- GROUPS
        -- =================================================

        INSERT INTO public.tb_groups(name, slug)
        SELECT DISTINCT
            trim(g),
            regexp_replace(lower(trim(g)), '[^a-z0-9]+', '-', 'g')
        FROM jsonb_array_elements_text(v_groups) g
        WHERE trim(g) <> ''
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO public.comic_groups(comic_id, group_id, created_at)
        SELECT DISTINCT
            v_comic_id,
            g.id,
            now()
        FROM public.tb_groups g
        WHERE g.slug IN (
            SELECT regexp_replace(lower(trim(x)), '[^a-z0-9]+', '-', 'g')
            FROM jsonb_array_elements_text(v_groups) x
        )
        ON CONFLICT DO NOTHING;

        -- =================================================
        -- PARODIES
        -- =================================================

        INSERT INTO public.tb_parodies(name, slug)
        SELECT DISTINCT
            trim(p),
            regexp_replace(lower(trim(p)), '[^a-z0-9]+', '-', 'g')
        FROM jsonb_array_elements_text(v_parodies) p
        WHERE trim(p) <> ''
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO public.comic_parodies(comic_id, parody_id, created_at)
        SELECT DISTINCT
            v_comic_id,
            p.id,
            now()
        FROM public.tb_parodies p
        WHERE p.slug IN (
            SELECT regexp_replace(lower(trim(x)), '[^a-z0-9]+', '-', 'g')
            FROM jsonb_array_elements_text(v_parodies) x
        )
        ON CONFLICT DO NOTHING;

        -- =================================================
        -- ARTISTS
        -- =================================================

        INSERT INTO public.tb_artists(name, slug)
        SELECT DISTINCT
            trim(a),
            regexp_replace(lower(trim(a)), '[^a-z0-9]+', '-', 'g')
        FROM jsonb_array_elements_text(v_artists) a
        WHERE trim(a) <> ''
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO public.comic_artists(comic_id, artist_id, created_at)
        SELECT DISTINCT
            v_comic_id,
            a.id,
            now()
        FROM public.tb_artists a
        WHERE a.slug IN (
            SELECT regexp_replace(lower(trim(x)), '[^a-z0-9]+', '-', 'g')
            FROM jsonb_array_elements_text(v_artists) x
        )
        ON CONFLICT DO NOTHING;

        -- =================================================
        -- AUTHORS
        -- =================================================

        INSERT INTO public.tb_authors(name, slug)
        SELECT DISTINCT
            trim(a),
            regexp_replace(lower(trim(a)), '[^a-z0-9]+', '-', 'g')
        FROM jsonb_array_elements_text(v_authors) a
        WHERE trim(a) <> ''
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO public.comic_authors(comic_id, author_id, created_at)
        SELECT DISTINCT
            v_comic_id,
            a.id,
            now()
        FROM public.tb_authors a
        WHERE a.slug IN (
            SELECT regexp_replace(lower(trim(x)), '[^a-z0-9]+', '-', 'g')
            FROM jsonb_array_elements_text(v_authors) x
        )
        ON CONFLICT DO NOTHING;

        -- =================================================
        -- CHARACTERS
        -- =================================================

        INSERT INTO public.tb_characters(name, slug)
        SELECT DISTINCT
            trim(c),
            regexp_replace(lower(trim(c)), '[^a-z0-9]+', '-', 'g')
        FROM jsonb_array_elements_text(v_characters) c
        WHERE trim(c) <> ''
        ON CONFLICT (slug) DO NOTHING;

        INSERT INTO public.comic_characters(comic_id, character_id, created_at)
        SELECT DISTINCT
            v_comic_id,
            c.id,
            now()
        FROM public.tb_characters c
        WHERE c.slug IN (
            SELECT regexp_replace(lower(trim(x)), '[^a-z0-9]+', '-', 'g')
            FROM jsonb_array_elements_text(v_characters) x
        )
        ON CONFLICT DO NOTHING;

        -- =================================================
        -- CHAPTERS
        -- =================================================

        IF jsonb_typeof(v_comic->'chapters') = 'array' THEN

            FOR v_chapter IN
                SELECT *
                FROM jsonb_array_elements(v_comic->'chapters')
            LOOP

                v_language_code :=
                    CASE lower(COALESCE(v_chapter->>'language', 'english'))
                        WHEN 'japanese' THEN 'jp'
                        WHEN 'english' THEN 'en'
                        WHEN 'indonesian' THEN 'id'
                        WHEN 'korean' THEN 'kr'
                        WHEN 'chinese' THEN 'cn'
                        ELSE 'en'
                    END;

                INSERT INTO public.languages(code, name)
                VALUES (
                    v_language_code,
                    COALESCE(v_chapter->>'language', 'english')
                )
                ON CONFLICT (code) DO NOTHING;

                INSERT INTO public.chapters(
                    comic_id,
                    chapter_number,
                    title,
                    language_code,
                    censorship_id,
                    published_at,
                    total_pages,
                    created_at,
                    updated_at
                )
                VALUES (
                    v_comic_id,
                    COALESCE(v_chapter->>'number', '000'),
                    COALESCE(v_chapter->>'title', ''),
                    v_language_code,
                    v_censorship_id,
                    (v_chapter->>'uploadChapter')::timestamptz,
                    jsonb_array_length(
                        COALESCE(v_chapter->'pages', '[]'::jsonb)
                    ),
                    now(),
                    now()
                )
                RETURNING id INTO v_chapter_id;

                -- =================================================
                -- PAGES
                -- =================================================

                v_page_index := 1;

                IF jsonb_typeof(v_chapter->'pages') = 'array' THEN

                    FOR v_page IN
                        SELECT *
                        FROM jsonb_array_elements(v_chapter->'pages')
                    LOOP

                        INSERT INTO public.pages(
                            chapter_id,
                            page_number,
                            filename,
                            filepath,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            v_chapter_id,
                            COALESCE(
                                (v_page->>'order')::int,
                                v_page_index
                            ),
                            v_page->>'filename',
                            format(
                                '/komify/%s/chapters/%s/%s',
                                v_comic->>'slug',
                                v_chapter->>'number',
                                v_page->>'filename'
                            ),
                            now(),
                            now()
                        );

                        v_page_index := v_page_index + 1;

                    END LOOP;

                END IF;

            END LOOP;

        END IF;

    END LOOP;

END;
$function$
;

-- DROP FUNCTION public.fn_reset_all_data();

CREATE OR REPLACE FUNCTION public.fn_reset_all_data()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN

    -- =================================================
    -- DISABLE TRIGGER TEMPORARILY
    -- =================================================

    SET session_replication_role = replica;

    -- =================================================
    -- DELETE CHILD TABLES FIRST
    -- =================================================

    DELETE FROM search_indexes;

    DELETE FROM read_histories;
    DELETE FROM bookmarks;

    DELETE FROM comic_authors;
    DELETE FROM comic_characters;
    DELETE FROM comic_parodies;
    DELETE FROM comic_groups;
    DELETE FROM comic_artists;
    DELETE FROM comic_tags;

    DELETE FROM pages;
    DELETE FROM chapters;

    DELETE FROM comics;

    -- =================================================
    -- DELETE MASTER / TAG TABLES
    -- =================================================

    DELETE FROM tb_authors;
    DELETE FROM tb_characters;
    DELETE FROM tb_parodies;
    DELETE FROM tb_groups;
    DELETE FROM tb_artists;
    DELETE FROM tb_tags;

    DELETE FROM import_logs;

    DELETE FROM tb_users;

    DELETE FROM censorships;
    DELETE FROM statuses;
    DELETE FROM categories;

    DELETE FROM languages;

    -- =================================================
    -- ENABLE TRIGGER AGAIN
    -- =================================================

    SET session_replication_role = DEFAULT;

    RAISE NOTICE 'All Komify data has been deleted successfully.';

END;
$function$
;