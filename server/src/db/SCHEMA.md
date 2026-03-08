# Database Schema

## users
| Column      | Type      | Description                    |
|-------------|-----------|--------------------------------|
| id          | uuid PK   | References auth.users          |
| email       | varchar   | User email                     |
| created_at  | timestamptz | Created timestamp            |
| updated_at  | timestamptz | Updated timestamp            |

## problems
| Column       | Type      | Description                    |
|--------------|-----------|--------------------------------|
| id           | varchar PK | Problem id                    |
| title        | varchar   | Problem title                  |
| instructions | text      | Problem description            |
| solution     | text      | Reference solution (nullable)  |
| difficulty   | varchar   | learn, easy, medium, hard       |
| language     | varchar   | Problem language               |
| tests        | jsonb     | Test cases                     |
| starter_code | text      | Default code (nullable)        |
| validation   | jsonb     | Validation config (nullable)   |

## problem_completions
| Column       | Type      | Description                    |
|--------------|-----------|--------------------------------|
| id           | uuid PK   | Completion id                  |
| user_id      | uuid FK   | References auth.users          |
| problem_id   | varchar FK| References problems            |
| solution_code| text      | User's submitted code          |
| language     | varchar   | Language used                  |
| completed_at | timestamptz | When completed (null = attempted) |

## files
| Column     | Type      | Description                    |
|------------|-----------|--------------------------------|
| id         | uuid PK   | File id                        |
| user_id    | uuid FK   | References auth.users          |
| name       | varchar   | File name                      |
| code       | text      | File content                   |

## projects
| Column  | Type      | Description                    |
|---------|-----------|--------------------------------|
| id      | varchar PK| Project id (from .md filename) |
| name    | varchar   | Display name                   |
| content | text      | Markdown content               |
