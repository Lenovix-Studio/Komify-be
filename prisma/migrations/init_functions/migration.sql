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
